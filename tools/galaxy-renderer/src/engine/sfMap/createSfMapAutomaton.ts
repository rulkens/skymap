/**
 * createSfMapAutomaton — the SSPSF star-formation automaton: its pipelines,
 * its ping-ponged state, and the dispatch loop that reruns it from scratch.
 *
 * The grid is fixed (SF_MAP_AZ x SF_MAP_RINGS, `galaxySfMapArmForcing.ts`), so
 * every texture here is allocated ONCE — none are canvas-size-dependent, which
 * is what lets this module own them outright rather than rebuild on resize.
 *
 * `rebuild` takes the geometry/tuning/seed it runs against as ARGUMENTS and
 * returns the grid it wrote. Nothing here reads engine state, and nothing here
 * schedules the readback: the caller owns both, so a stale-capture bug has no
 * surface to appear on.
 */
import { ADDITIVE_BLEND } from '../../../../../src/services/gpu/lib/blendStates';
import {
  buildGalaxySfMapArmForcing,
  sfMapGridRadiusOrDefault,
  SF_MAP_AZ,
  SF_MAP_RINGS,
  SF_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import { alignedBytesPerRow } from '../../../../../src/utils/gpu/alignedBytesPerRow';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { sfMapStepIndexData } from './sfMapStepIndexData';
import { packSfMapConstants, SF_MAP_CONSTANTS_BUFFER_SIZE } from '../uniforms/packSfMapConstants';
import { packSfMapUnshear, SF_MAP_UNSHEAR_BUFFER_SIZE } from '../uniforms/packSfMapUnshear';

import sfMapStepWgsl from '../shaders/milkyWayField/sfMapStep.wesl?static';
import sfMapPackWgsl from '../shaders/milkyWayField/sfMapPack.wesl?static';
import sfMapPresentWgsl from '../shaders/milkyWayField/sfMapPresent.wesl?static';

export type SfMapAutomaton = {
  /** The packed, presentable output (gas / recent SF / older SF) the orientation chain and the CPU readback both read. */
  readonly texture: GPUTexture;
  readonly readbackBuffer: GPUBuffer;
  readonly readbackBytesPerRow: number;
  readonly presentPipeline: GPURenderPipeline;
  readonly presentBindGroup: GPUBindGroup;
  /**
   * Rerun the automaton over `geometry`, or clear it when there is no geometry
   * / the tuning has it disabled. Returns the grid it wrote, so the caller's
   * readback records the rMin/rMax matching the CONTENT rather than re-deriving
   * a grid that may have moved since.
   */
  rebuild(input: {
    readonly geometry: GalaxyDescription | null;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
  }): GalaxySfMapGridRadius;
  dispose(): void;
};

export function createSfMapAutomaton(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly hdrFormat: GPUTextureFormat;
    /** io.wesl's per-frame camera uniform — the present bind group's binding 0. */
    readonly fieldUbo: GPUBuffer;
  },
): SfMapAutomaton {
  const { makeShader } = deps;

  const stepMod = makeShader(sfMapStepWgsl, 'galaxy:sfMapStep');
  const stepPipe = device.createComputePipeline({
    label: 'galaxy:sfMapStepPipe',
    layout: 'auto',
    compute: { module: stepMod, entryPoint: 'cs' },
  });
  const packMod = makeShader(sfMapPackWgsl, 'galaxy:sfMapPack');
  const packPipe = device.createComputePipeline({
    label: 'galaxy:sfMapPackPipe',
    layout: 'auto',
    compute: { module: packMod, entryPoint: 'cs' },
  });
  const presentMod = makeShader(sfMapPresentWgsl, 'galaxy:sfMapPresent');
  const presentPipe = device.createRenderPipeline({
    label: 'galaxy:sfMapPresentPipe',
    layout: 'auto',
    vertex: { module: presentMod, entryPoint: 'vs' },
    // Additive, not a bare overwrite: this pass draws straight into the scene
    // pass's `sceneTex`, which already carries any background extras' sprite
    // glow by the time this draw runs — a replace blend would erase them under
    // the diagnostic. Against a freshly-cleared target the two are identical,
    // so this is a strict fix, not a behaviour trade.
    fragment: {
      module: presentMod,
      entryPoint: 'fs',
      targets: [{ format: deps.hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
  // 'repeat' in U (azimuth wraps at theta=0/2*PI), 'clamp-to-edge' in V
  // (radius does not) — sfMapPresent.wesl's fs resamples through this.
  const presentSampler = device.createSampler({
    label: 'galaxy:sfMapPresentSampler',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
  });
  // The arm-forcing field, baked CPU-side from the SAME ridge functions the
  // sprite/analytic arms use — never re-derived in WGSL.
  const armForcingTex = device.createTexture({
    label: 'galaxy:sfMapArmForcingTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Ping-pong state: (gasFraction, ageSinceIgnition, refractoryTimer,
  // oldActivityEma). Both need BOTH usages — each alternates between being the
  // step's read source and its write target from one step to the next.
  const makeStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const stateA = makeStateTex('galaxy:sfMapStateA');
  const stateB = makeStateTex('galaxy:sfMapStateB');
  const texture = device.createTexture({
    label: 'galaxy:sfMapTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  // `copyTextureToBuffer` forces `bytesPerRow` to a 256-byte multiple; the
  // readback's decode strips the padding so it never reaches `GalaxySfMap.data`.
  const readbackBytesPerRow = alignedBytesPerRow(SF_MAP_AZ * 4);
  const readbackBuffer = device.createBuffer({
    label: 'galaxy:sfMapReadbackBuf',
    size: readbackBytesPerRow * SF_MAP_RINGS,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  // Constant across one rebuild (rMin/rMax + every sfMap tuning knob).
  const constUbo = device.createBuffer({
    label: 'galaxy:sfMapConstUbo',
    size: SF_MAP_CONSTANTS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // rMin/rMax only — sfMapPresent.wesl's own small uniform, separate from
  // io.wesl's per-frame 'u' since the two change on entirely different
  // cadences (rebuild vs every frame).
  const gridUbo = device.createBuffer({
    label: 'galaxy:sfMapGridUbo',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // sfMapPack.wesl's own un-shear parameters. A separate buffer from `constUbo`
  // because pack runs in its OWN bind group / pipeline, after every step
  // dispatch has already used constUbo's bind group layout.
  const packConstUbo = device.createBuffer({
    label: 'galaxy:sfMapPackConstUbo',
    size: SF_MAP_UNSHEAR_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // One SfMapStepIndex-sized slot per step, each padded to the device's uniform
  // offset alignment. Reallocated per rebuild to match the live `steps` count.
  let stepIndexBuf: GPUBuffer | null = null;

  // Built once — `texture`/`gridUbo` are the same GPU objects for this
  // module's whole lifetime, only their CONTENT changes per rebuild, and a
  // bind group only needs rebuilding when the OBJECT it references does.
  const presentBindGroup = device.createBindGroup({
    label: 'galaxy:sfMapPresentBG',
    layout: presentPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: deps.fieldUbo } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: presentSampler },
      { binding: 3, resource: { buffer: gridUbo } },
    ],
  });

  const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
  const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;

  return {
    texture,
    readbackBuffer,
    readbackBytesPerRow,
    presentPipeline: presentPipe,
    presentBindGroup,

    rebuild({ geometry, tuning, seed }): GalaxySfMapGridRadius {
      const sfMap = tuning.sfMap;
      const grid = sfMapGridRadiusOrDefault(geometry);
      device.queue.writeBuffer(gridUbo, 0, new Float32Array([grid.rMin, grid.rMax, 0, 0]));

      if (!geometry || !sfMap.enabled || sfMap.steps <= 0) {
        // Disabled (or no galaxy yet): leave nothing stale for the sfMap view
        // to show. Cleared once rather than latched, since this path is a rare
        // toggle, not a per-frame branch.
        device.queue.writeTexture(
          { texture: armForcingTex },
          new Float32Array(SF_MAP_AZ * SF_MAP_RINGS),
          { bytesPerRow: SF_MAP_AZ * 4 },
          [SF_MAP_AZ, SF_MAP_RINGS],
        );
        device.queue.writeTexture(
          { texture },
          new Uint8Array(SF_MAP_AZ * SF_MAP_RINGS * 4),
          { bytesPerRow: SF_MAP_AZ * 4 },
          [SF_MAP_AZ, SF_MAP_RINGS],
        );
        return grid;
      }

      const forcing = buildGalaxySfMapArmForcing(geometry, tuning);
      device.queue.writeTexture(
        { texture: armForcingTex },
        forcing,
        { bytesPerRow: SF_MAP_AZ * 4 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );

      device.queue.writeBuffer(constUbo, 0, packSfMapConstants({ grid, sfMap, seed }));

      // Per-step data cannot ride one rewritten uniform: every writeBuffer here
      // happens before this function's single submit, and queue operations
      // apply in ISSUE order — N rewrites of one location would all land before
      // ANY dispatch ran, so every step would see only the LAST write. Instead
      // write every step's index ONCE at its own device-aligned offset and give
      // each step its OWN bind group with a STATIC offset into that slot.
      const steps = sfMap.steps;
      const stride = device.limits.minUniformBufferOffsetAlignment;
      if (stepIndexBuf) stepIndexBuf.destroy();
      stepIndexBuf = device.createBuffer({
        label: 'galaxy:sfMapStepIndexBuf',
        size: steps * stride,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(stepIndexBuf, 0, sfMapStepIndexData(steps, stride));

      const stepBindGroups: GPUBindGroup[] = [];
      for (let s = 0; s < steps; s++) {
        const prev = s % 2 === 0 ? stateA : stateB;
        const next = s % 2 === 0 ? stateB : stateA;
        stepBindGroups.push(
          device.createBindGroup({
            label: `galaxy:sfMapStepBG${s}`,
            layout: stepPipe.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: constUbo } },
              { binding: 1, resource: armForcingTex.createView() },
              { binding: 2, resource: prev.createView() },
              { binding: 3, resource: next.createView() },
              { binding: 4, resource: { buffer: stepIndexBuf, offset: s * stride, size: 4 } },
            ],
          }),
        );
      }

      const enc = device.createCommandEncoder({ label: 'galaxy:sfMapRebuild' });
      const stepPass = enc.beginComputePass({ label: 'galaxy:sfMapStepPass' });
      stepPass.setPipeline(stepPipe);
      for (let s = 0; s < steps; s++) {
        stepPass.setBindGroup(0, stepBindGroups[s]!);
        stepPass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      stepPass.end();

      // Parity of the LAST dispatched step (index steps-1) says which texture it
      // wrote into: even index writes B, odd writes A. That same steps-1 is also
      // the number of shear-applying generations the final state has
      // accumulated (step 0 only seeds — see sfMapStep.wesl), which is what
      // sfMapPack.wesl's un-shear needs, NOT the raw `steps` count.
      const finalState = (steps - 1) % 2 === 0 ? stateB : stateA;
      device.queue.writeBuffer(
        packConstUbo,
        0,
        packSfMapUnshear({ grid, sfMap, totalShiftSteps: steps - 1 }),
      );
      const packBG = device.createBindGroup({
        label: 'galaxy:sfMapPackBG',
        layout: packPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: finalState.createView() },
          { binding: 1, resource: texture.createView() },
          { binding: 2, resource: { buffer: packConstUbo } },
        ],
      });
      const packPass = enc.beginComputePass({ label: 'galaxy:sfMapPackPass' });
      packPass.setPipeline(packPipe);
      packPass.setBindGroup(0, packBG);
      packPass.dispatchWorkgroups(dispatchX, dispatchY);
      packPass.end();

      device.queue.submit([enc.finish()]);
      return grid;
    },

    dispose(): void {
      stepIndexBuf?.destroy();
      armForcingTex.destroy();
      stateA.destroy();
      stateB.destroy();
      texture.destroy();
      readbackBuffer.destroy();
      constUbo.destroy();
      gridUbo.destroy();
      packConstUbo.destroy();
    },
  };
}
