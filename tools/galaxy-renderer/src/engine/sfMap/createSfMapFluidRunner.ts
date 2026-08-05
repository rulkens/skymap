/**
 * createSfMapFluidRunner — the fluid SF-map generator: its pipelines, its
 * ping-ponged state, its event-impulse buffer, and the dispatch loop that
 * reruns it from scratch, writing into a `SfMapOutput` it does not own (see
 * `createSfMapOutput.ts`). Sibling of `createSfMapAutomatonRunner.ts`; only
 * `createSfMapGenerator.ts`'s dispatcher decides which one runs. See
 * `sfMapFluidStep.wesl`'s header for the integration scheme.
 *
 * `rebuild` takes the geometry/tuning/seed/grid it runs against as ARGUMENTS,
 * same contract as the automaton runner's own `rebuild` — no shared
 * step-dispatch code between the two, just the shape of the contract.
 */
import {
  buildGalaxySfMapArmForcing,
  SF_MAP_AZ,
  SF_MAP_RINGS,
  SF_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import type { GalaxySfMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapArmForcing';
import { buildGalaxySfMapFluidEvents } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapFluidEvents';
import { SF_MAP_FLUID_MAX_EVENTS } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxySfMapFluidEvents';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { packSfMapFluidStepIndex } from './packSfMapFluidStepIndex';
import {
  packSfMapFluidConstants,
  SF_MAP_FLUID_CONSTANTS_BUFFER_SIZE,
} from './packSfMapFluidConstants';
import { packSfMapFluidEvents, SF_MAP_FLUID_EVENT_STRIDE } from './packSfMapFluidEvents';
import type { SfMapOutput } from './createSfMapOutput';

import sfMapFluidStepWgsl from '../shaders/milkyWay/sfMap/sfMapFluidStep.wesl?static';
import sfMapFluidPackWgsl from '../shaders/milkyWay/sfMap/sfMapFluidPack.wesl?static';

export type SfMapFluidRunner = {
  /** Dispatch the fluid's N advection steps, its own straight repack into `output.texture`, and `output`'s dust-blur pass — one encoder, one submit. Caller has already checked `enabled`/`steps > 0` and written `output`'s grid. */
  rebuild(input: {
    readonly geometry: GalaxyDescription;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
    readonly grid: GalaxySfMapGridRadius;
  }): void;
  dispose(): void;
};

export function createSfMapFluidRunner(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly output: SfMapOutput;
  },
): SfMapFluidRunner {
  const { makeShader, output } = deps;

  const stepMod = makeShader(sfMapFluidStepWgsl, 'galaxy:sfMapFluidStep');
  const stepPipe = device.createComputePipeline({
    label: 'galaxy:sfMapFluidStepPipe',
    layout: 'auto',
    compute: { module: stepMod, entryPoint: 'cs' },
  });
  const packMod = makeShader(sfMapFluidPackWgsl, 'galaxy:sfMapFluidPack');
  const packPipe = device.createComputePipeline({
    label: 'galaxy:sfMapFluidPackPipe',
    layout: 'auto',
    compute: { module: packMod, entryPoint: 'cs' },
  });
  const makeStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [SF_MAP_AZ, SF_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const stateA = makeStateTex('galaxy:sfMapFluidStateA');
  const stateB = makeStateTex('galaxy:sfMapFluidStateB');
  // This generator's OWN copy of the automaton's armForcingTex — same upload
  // pattern as createSfMapAutomatonRunner.ts, deliberately not shared: the
  // two runners are un-complected siblings, and a shared texture would tie
  // their dispose()/rebuild() lifecycles together for no benefit (neither
  // runs while the other doesn't need this data). The gather velocity term
  // in sfMapFluidStep.wesl samples it directly, unlike the events builder
  // below which reads the same CPU field (never the texture).
  const armForcingTex = device.createTexture({
    label: 'galaxy:sfMapFluidArmForcingTex',
    size: [SF_MAP_AZ, SF_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const constUbo = device.createBuffer({
    label: 'galaxy:sfMapFluidConstUbo',
    size: SF_MAP_FLUID_CONSTANTS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Allocated once at the fixed CAP (`SF_MAP_FLUID_MAX_EVENTS`), same
  // reuse-the-object-vary-the-content precedent as the automaton runner's
  // armForcingTex/state textures — each rebuild only rewrites the USED
  // prefix and binds a sub-range (`size:` below) matching that rebuild's
  // actual event count.
  const eventsBuf = device.createBuffer({
    label: 'galaxy:sfMapFluidEventsBuf',
    size: SF_MAP_FLUID_MAX_EVENTS * SF_MAP_FLUID_EVENT_STRIDE * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  let stepIndexBuf: GPUBuffer | null = null;

  const dispatchX = SF_MAP_AZ / SF_MAP_WORKGROUP_SIZE;
  const dispatchY = SF_MAP_RINGS / SF_MAP_WORKGROUP_SIZE;

  return {
    rebuild({ geometry, tuning, seed, grid }): void {
      const fluid = tuning.sfMapFluid;

      device.queue.writeBuffer(constUbo, 0, packSfMapFluidConstants({ grid, fluid }));

      // Same CPU field `buildGalaxySfMapFluidEvents` below reads for its own
      // event-placement bias — its call re-reads `buildGalaxySfMapArmForcing`
      // with the SAME (geometry, tuning) key, so this only ever costs a
      // second call, never a third; the memo in galaxySfMapArmForcing.ts
      // (when it lands) makes even that call free, but nothing here depends
      // on it landing.
      const forcing = buildGalaxySfMapArmForcing(geometry, tuning);
      device.queue.writeTexture(
        { texture: armForcingTex },
        forcing,
        { bytesPerRow: SF_MAP_AZ * 4 },
        [SF_MAP_AZ, SF_MAP_RINGS],
      );

      const events = buildGalaxySfMapFluidEvents(geometry, tuning, seed);
      const packedEvents = packSfMapFluidEvents(events);
      // A zero-length writeBuffer/bind range is valid WebGPU (an empty run
      // just never satisfies any event's age window) — no special-case for
      // "no events" needed here.
      if (packedEvents.byteLength > 0) {
        device.queue.writeBuffer(eventsBuf, 0, packedEvents);
      }

      const steps = fluid.steps;
      const stride = device.limits.minUniformBufferOffsetAlignment;
      if (stepIndexBuf) stepIndexBuf.destroy();
      stepIndexBuf = device.createBuffer({
        label: 'galaxy:sfMapFluidStepIndexBuf',
        size: steps * stride,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        stepIndexBuf,
        0,
        packSfMapFluidStepIndex(events, steps, fluid.impulseDuration, stride),
      );

      // Every step's bind group shares the SAME eventsBuf sub-range — only
      // constUbo/prev/next/stepIndex vary per step, same shape as the
      // automaton runner's own per-step bind groups.
      const stepBindGroups: GPUBindGroup[] = [];
      for (let s = 0; s < steps; s++) {
        const prev = s % 2 === 0 ? stateA : stateB;
        const next = s % 2 === 0 ? stateB : stateA;
        stepBindGroups.push(
          device.createBindGroup({
            label: `galaxy:sfMapFluidStepBG${s}`,
            layout: stepPipe.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: constUbo } },
              { binding: 1, resource: prev.createView() },
              { binding: 2, resource: next.createView() },
              // size: 12 — step, activeStart, activeEnd (SfMapFluidStepIndex,
              // sfMapFluidStep.wesl), up from the single `step` float the
              // shared sfMapStepIndexData.ts shape carries.
              { binding: 3, resource: { buffer: stepIndexBuf, offset: s * stride, size: 12 } },
              {
                binding: 4,
                resource: {
                  buffer: eventsBuf,
                  size: Math.max(packedEvents.byteLength, 4),
                },
              },
              { binding: 5, resource: armForcingTex.createView() },
            ],
          }),
        );
      }

      const enc = device.createCommandEncoder({ label: 'galaxy:sfMapFluidRebuild' });
      const stepPass = enc.beginComputePass({ label: 'galaxy:sfMapFluidStepPass' });
      stepPass.setPipeline(stepPipe);
      for (let s = 0; s < steps; s++) {
        stepPass.setBindGroup(0, stepBindGroups[s]!);
        stepPass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      stepPass.end();

      // Same even/odd parity as the automaton runner: step 0 only seeds, so
      // the last DISPATCHED step is index steps-1.
      const finalState = (steps - 1) % 2 === 0 ? stateB : stateA;
      const packBG = device.createBindGroup({
        label: 'galaxy:sfMapFluidPackBG',
        layout: packPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: finalState.createView() },
          { binding: 1, resource: output.texture.createView() },
        ],
      });
      const packPass = enc.beginComputePass({ label: 'galaxy:sfMapFluidPackPass' });
      packPass.setPipeline(packPipe);
      packPass.setBindGroup(0, packBG);
      packPass.dispatchWorkgroups(dispatchX, dispatchY);
      packPass.end();

      output.encodeDustBlurPass(enc);

      device.queue.submit([enc.finish()]);
    },

    dispose(): void {
      stepIndexBuf?.destroy();
      armForcingTex.destroy();
      stateA.destroy();
      stateB.destroy();
      constUbo.destroy();
      eventsBuf.destroy();
    },
  };
}
