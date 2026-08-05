/**
 * createSfMapAutomatonRunner — the SSPSF star-formation automaton: its
 * pipelines, its ping-ponged state, and the dispatch loop that reruns it
 * from scratch, writing into a `SfMapOutput` it does not own (see
 * `createSfMapOutput.ts`). Sibling of `createSfMapFluidRunner.ts`; only
 * `createSfMapGenerator.ts`'s dispatcher decides which one runs.
 *
 * The grid is fixed (SF_MAP_AZ x SF_MAP_RINGS, `galaxySfMapArmForcing.ts`), so
 * every texture here is allocated ONCE — none are canvas-size-dependent, which
 * is what lets this module own them outright rather than rebuild on resize.
 *
 * `rebuild` takes the geometry/tuning/seed/grid it runs against as ARGUMENTS.
 * Nothing here reads engine state, and nothing here schedules the readback:
 * the caller owns both, so a stale-capture bug has no surface to appear on.
 */
import {
  buildGalaxySfMapArmForcing,
  SF_MAP_AZ,
  SF_MAP_RINGS,
  SF_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { sfMapStepIndexData } from './sfMapStepIndexData';
import {
  packSfMapAutomatonConstants,
  SF_MAP_AUTOMATON_CONSTANTS_BUFFER_SIZE,
} from './packSfMapAutomatonConstants';
import { packSfMapUnshear, SF_MAP_UNSHEAR_BUFFER_SIZE } from './packSfMapUnshear';
import type { SfMapOutput } from './createSfMapOutput';

import sfMapAutomatonStepWgsl from '../shaders/milkyWay/sfMap/sfMapAutomatonStep.wesl?static';
import sfMapPackWgsl from '../shaders/milkyWay/sfMap/sfMapPack.wesl?static';

export type SfMapAutomatonRunner = {
  /** Dispatch the automaton's N steps, its own un-shear pack into `output.texture`, and `output`'s dust-blur pass — one encoder, one submit. Caller has already checked `enabled`/`steps > 0` and written `output`'s grid. */
  rebuild(input: {
    readonly geometry: GalaxyDescription;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
    readonly grid: GalaxySfMapGridRadius;
  }): void;
  dispose(): void;
};

export function createSfMapAutomatonRunner(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly output: SfMapOutput;
  },
): SfMapAutomatonRunner {
  const { makeShader, output } = deps;

  const stepMod = makeShader(sfMapAutomatonStepWgsl, 'galaxy:sfMapAutomatonStep');
  const stepPipe = device.createComputePipeline({
    label: 'galaxy:sfMapAutomatonStepPipe',
    layout: 'auto',
    compute: { module: stepMod, entryPoint: 'cs' },
  });
  const packMod = makeShader(sfMapPackWgsl, 'galaxy:sfMapAutomatonPack');
  const packPipe = device.createComputePipeline({
    label: 'galaxy:sfMapAutomatonPackPipe',
    layout: 'auto',
    compute: { module: packMod, entryPoint: 'cs' },
  });
  // The arm-forcing field, baked CPU-side from the SAME ridge functions the
  // sprite/analytic arms use — never re-derived in WGSL. Automaton-only: the
  // fluid generator reads the same CPU field for its event-list bias
  // (`galaxySfMapFluidEvents.ts`) but never uploads it to the GPU.
  const armForcingTex = device.createTexture({
    label: 'galaxy:sfMapArmForcingTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Ping-pong state: (gasFraction, ageSinceIgnition, dust, oldActivityEma) —
  // refractory is DERIVED from age in sfMapAutomatonStep.wesl, not stored;
  // that frees the z slot for the conserved dust channel the snowplough
  // rule transports (docs/research/m74-jwst/06-ca-dust-channel-sketch.md).
  // Both need BOTH usages — each alternates between being the step's read
  // source and its write target from one step to the next.
  const makeStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const stateA = makeStateTex('galaxy:sfMapAutomatonStateA');
  const stateB = makeStateTex('galaxy:sfMapAutomatonStateB');
  // Constant across one rebuild (rMin/rMax + every automaton tuning knob).
  const constUbo = device.createBuffer({
    label: 'galaxy:sfMapAutomatonConstUbo',
    size: SF_MAP_AUTOMATON_CONSTANTS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // sfMapPack.wesl's own un-shear parameters. A separate buffer from `constUbo`
  // because pack runs in its OWN bind group / pipeline, after every step
  // dispatch has already used constUbo's bind group layout.
  const packConstUbo = device.createBuffer({
    label: 'galaxy:sfMapAutomatonPackConstUbo',
    size: SF_MAP_UNSHEAR_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // One SfMapStepIndex-sized slot per step, each padded to the device's uniform
  // offset alignment. Reallocated per rebuild to match the live `steps` count.
  let stepIndexBuf: GPUBuffer | null = null;

  const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
  const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;

  return {
    rebuild({ geometry, tuning, seed, grid }): void {
      const sfMap = tuning.sfMapAutomaton;

      const forcing = buildGalaxySfMapArmForcing(geometry, tuning);
      device.queue.writeTexture(
        { texture: armForcingTex },
        forcing,
        { bytesPerRow: SF_MAP_AZ * 4 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );

      device.queue.writeBuffer(constUbo, 0, packSfMapAutomatonConstants({ grid, sfMap, seed }));

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
        label: 'galaxy:sfMapAutomatonStepIndexBuf',
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
            label: `galaxy:sfMapAutomatonStepBG${s}`,
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

      const enc = device.createCommandEncoder({ label: 'galaxy:sfMapAutomatonRebuild' });
      const stepPass = enc.beginComputePass({ label: 'galaxy:sfMapAutomatonStepPass' });
      stepPass.setPipeline(stepPipe);
      for (let s = 0; s < steps; s++) {
        stepPass.setBindGroup(0, stepBindGroups[s]!);
        stepPass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      stepPass.end();

      // Parity of the LAST dispatched step (index steps-1) says which texture it
      // wrote into: even index writes B, odd writes A. That same steps-1 is also
      // the number of shear-applying generations the final state has
      // accumulated (step 0 only seeds — see sfMapAutomatonStep.wesl), which is
      // what sfMapPack.wesl's un-shear needs, NOT the raw `steps` count.
      const finalState = (steps - 1) % 2 === 0 ? stateB : stateA;
      device.queue.writeBuffer(
        packConstUbo,
        0,
        packSfMapUnshear({ grid, sfMap, totalShiftSteps: steps - 1 }),
      );
      const packBG = device.createBindGroup({
        label: 'galaxy:sfMapAutomatonPackBG',
        layout: packPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: finalState.createView() },
          { binding: 1, resource: output.texture.createView() },
          { binding: 2, resource: { buffer: packConstUbo } },
        ],
      });
      const packPass = enc.beginComputePass({ label: 'galaxy:sfMapAutomatonPackPass' });
      packPass.setPipeline(packPipe);
      packPass.setBindGroup(0, packBG);
      packPass.dispatchWorkgroups(dispatchX, dispatchY);
      packPass.end();

      // S4's low-pass, in the same encoder right after the pack pass writes
      // `output.texture` — the blur reads exactly what pack just produced.
      // Lives on `tuning.dust`, not `sfMapAutomaton` (`sweptMix` gates a
      // CONSUMER of this generator's output, not a parameter of the
      // generator itself).
      output.encodeDustBlurPass(enc, tuning.dust.sweptMix ?? 0);

      device.queue.submit([enc.finish()]);
    },

    dispose(): void {
      stepIndexBuf?.destroy();
      armForcingTex.destroy();
      stateA.destroy();
      stateB.destroy();
      constUbo.destroy();
      packConstUbo.destroy();
    },
  };
}
