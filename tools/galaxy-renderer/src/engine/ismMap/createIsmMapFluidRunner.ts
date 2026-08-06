/**
 * createIsmMapFluidRunner — the fluid ISM-map generator: its pipelines, its
 * ping-ponged state, its event-impulse buffer, and the dispatch loop that
 * reruns it from scratch, writing into a `IsmMapOutput` it does not own (see
 * `createIsmMapOutput.ts`). Sibling of `createIsmMapAutomatonRunner.ts`; only
 * `createIsmMapGenerator.ts`'s dispatcher decides which one runs. See
 * `ismMapFluidStep.wesl`'s header for the integration scheme.
 *
 * Each step is TWO dispatches sharing one compute pass: `ismMapFluidVelocity`
 * (Pass A) composes this step's velocity field once per texel into
 * `velocityTex`, then `ismMapFluidStep` (Pass B) reads it back to advect and
 * difference — WebGPU synchronizes a storage-texture write against a later
 * read within the same compute pass, so no pass split is needed. Step 0
 * only ever dispatches Pass B (it seeds and returns; velocity is unused).
 *
 * `rebuild` takes the geometry/tuning/seed/grid it runs against as ARGUMENTS,
 * same contract as the automaton runner's own `rebuild` — no shared
 * step-dispatch code between the two, just the shape of the contract.
 */
import {
  buildGalaxyIsmMapArmForcing,
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ISM_MAP_WORKGROUP_SIZE,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import type { GalaxyIsmMapGridRadius } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { buildGalaxyIsmMapFluidEvents } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapFluidEvents';
import { ISM_MAP_FLUID_MAX_EVENTS } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapFluidEvents';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';

import { packIsmMapFluidStepIndex } from './packIsmMapFluidStepIndex';
import {
  packIsmMapFluidConstants,
  ISM_MAP_FLUID_CONSTANTS_BUFFER_SIZE,
} from './packIsmMapFluidConstants';
import { packIsmMapFluidEvents, ISM_MAP_FLUID_EVENT_STRIDE } from './packIsmMapFluidEvents';
import type { IsmMapOutput } from './createIsmMapOutput';

import ismMapFluidVelocityWgsl from '../shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl?static';
import ismMapFluidStepWgsl from '../shaders/milkyWay/ismMap/ismMapFluidStep.wesl?static';
import ismMapFluidPackWgsl from '../shaders/milkyWay/ismMap/ismMapFluidPack.wesl?static';

export type IsmMapFluidRunner = {
  /** Dispatch the fluid's N advection steps, its own straight repack into `output.texture`, and `output`'s dust-blur pass — one encoder, one submit. Caller has already checked `enabled`/`steps > 0` and written `output`'s grid. */
  rebuild(input: {
    readonly geometry: GalaxyDescription;
    readonly tuning: GalaxyFieldTuning;
    readonly seed: number;
    readonly grid: GalaxyIsmMapGridRadius;
  }): void;
  dispose(): void;
};

export function createIsmMapFluidRunner(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly output: IsmMapOutput;
  },
): IsmMapFluidRunner {
  const { makeShader, output } = deps;

  const velocityMod = makeShader(ismMapFluidVelocityWgsl, 'galaxy:ismMapFluidVelocity');
  const velocityPipe = device.createComputePipeline({
    label: 'galaxy:ismMapFluidVelocityPipe',
    layout: 'auto',
    compute: { module: velocityMod, entryPoint: 'cs' },
  });
  const stepMod = makeShader(ismMapFluidStepWgsl, 'galaxy:ismMapFluidStep');
  const stepPipe = device.createComputePipeline({
    label: 'galaxy:ismMapFluidStepPipe',
    layout: 'auto',
    compute: { module: stepMod, entryPoint: 'cs' },
  });
  const packMod = makeShader(ismMapFluidPackWgsl, 'galaxy:ismMapFluidPack');
  const packPipe = device.createComputePipeline({
    label: 'galaxy:ismMapFluidPackPipe',
    layout: 'auto',
    compute: { module: packMod, entryPoint: 'cs' },
  });
  const makeStateTex = (label: string): GPUTexture =>
    device.createTexture({
      label,
      size: [ISM_MAP_AZ, ISM_MAP_RINGS],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  const stateA = makeStateTex('galaxy:ismMapFluidStateA');
  const stateB = makeStateTex('galaxy:ismMapFluidStateB');
  // One texture is enough: Pass A (ismMapFluidVelocity) writes it, Pass B
  // (ismMapFluidStep) reads it back, both within the SAME step's compute
  // pass — no ping-pong needed since nothing reads a PRIOR step's velocity.
  const velocityTex = device.createTexture({
    label: 'galaxy:ismMapFluidVelocityTex',
    size: [ISM_MAP_AZ, ISM_MAP_RINGS],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  // This generator's OWN copy of the automaton's armForcingTex — same upload
  // pattern as createIsmMapAutomatonRunner.ts, deliberately not shared: the
  // two runners are un-complected siblings, and a shared texture would tie
  // their dispose()/rebuild() lifecycles together for no benefit (neither
  // runs while the other doesn't need this data). The gather velocity term
  // in ismMapFluidVelocity.wesl samples it directly, unlike the events
  // builder below which reads the same CPU field (never the texture).
  const armForcingTex = device.createTexture({
    label: 'galaxy:ismMapFluidArmForcingTex',
    size: [ISM_MAP_AZ, ISM_MAP_RINGS],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const constUbo = device.createBuffer({
    label: 'galaxy:ismMapFluidConstUbo',
    size: ISM_MAP_FLUID_CONSTANTS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // Allocated once at the fixed CAP (`ISM_MAP_FLUID_MAX_EVENTS`), same
  // reuse-the-object-vary-the-content precedent as the automaton runner's
  // armForcingTex/state textures — each rebuild only rewrites the USED
  // prefix and binds a sub-range (`size:` below) matching that rebuild's
  // actual event count.
  const eventsBuf = device.createBuffer({
    label: 'galaxy:ismMapFluidEventsBuf',
    size: ISM_MAP_FLUID_MAX_EVENTS * ISM_MAP_FLUID_EVENT_STRIDE * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  let stepIndexBuf: GPUBuffer | null = null;

  const dispatchX = ISM_MAP_AZ / ISM_MAP_WORKGROUP_SIZE;
  const dispatchY = ISM_MAP_RINGS / ISM_MAP_WORKGROUP_SIZE;

  return {
    rebuild({ geometry, tuning, seed, grid }): void {
      const fluid = tuning.ismMapFluid;

      device.queue.writeBuffer(constUbo, 0, packIsmMapFluidConstants({ grid, fluid }));

      // Same CPU field `buildGalaxyIsmMapFluidEvents` below reads for its own
      // event-placement bias — its call re-reads `buildGalaxyIsmMapArmForcing`
      // with the SAME (geometry, tuning) key, so this only ever costs a
      // second call, never a third; the memo in galaxyIsmMapArmForcing.ts
      // (when it lands) makes even that call free, but nothing here depends
      // on it landing.
      const forcing = buildGalaxyIsmMapArmForcing(geometry, tuning);
      device.queue.writeTexture(
        { texture: armForcingTex },
        forcing,
        { bytesPerRow: ISM_MAP_AZ * 4 },
        [ISM_MAP_AZ, ISM_MAP_RINGS],
      );

      const events = buildGalaxyIsmMapFluidEvents(geometry, tuning, seed);
      const packedEvents = packIsmMapFluidEvents(events);
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
        label: 'galaxy:ismMapFluidStepIndexBuf',
        size: steps * stride,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        stepIndexBuf,
        0,
        packIsmMapFluidStepIndex(events, steps, fluid.impulseDuration, stride),
      );

      // Every step's bind groups share the SAME eventsBuf sub-range — only
      // constUbo/prev/next/stepIndex vary per step, same shape as the
      // automaton runner's own per-step bind groups. Step 0 gets no Pass A
      // bind group: its shader seeds and returns without touching velocity.
      const stepBindGroupsB: GPUBindGroup[] = [];
      const stepBindGroupsA: (GPUBindGroup | null)[] = [];
      for (let s = 0; s < steps; s++) {
        const prev = s % 2 === 0 ? stateA : stateB;
        const next = s % 2 === 0 ? stateB : stateA;
        // size: 12 — step, activeStart, activeEnd (IsmMapFluidStepIndex,
        // ismMapFluidVelocity.wesl/ismMapFluidStep.wesl), up from the single
        // `step` float the shared ismMapStepIndexData.ts shape carries.
        const stepIndexEntry = { binding: 3, resource: { buffer: stepIndexBuf, offset: s * stride, size: 12 } };
        stepBindGroupsB.push(
          device.createBindGroup({
            label: `galaxy:ismMapFluidStepBG${s}`,
            layout: stepPipe.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: constUbo } },
              { binding: 1, resource: prev.createView() },
              { binding: 2, resource: next.createView() },
              stepIndexEntry,
              { binding: 4, resource: velocityTex.createView() },
            ],
          }),
        );
        stepBindGroupsA.push(
          s === 0
            ? null
            : device.createBindGroup({
                label: `galaxy:ismMapFluidVelocityBG${s}`,
                layout: velocityPipe.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: { buffer: constUbo } },
                  { binding: 1, resource: prev.createView() },
                  { binding: 2, resource: { buffer: stepIndexBuf, offset: s * stride, size: 12 } },
                  {
                    binding: 3,
                    resource: {
                      buffer: eventsBuf,
                      size: Math.max(packedEvents.byteLength, 4),
                    },
                  },
                  { binding: 4, resource: armForcingTex.createView() },
                  { binding: 5, resource: velocityTex.createView() },
                ],
              }),
        );
      }

      const enc = device.createCommandEncoder({ label: 'galaxy:ismMapFluidRebuild' });
      const stepPass = enc.beginComputePass({ label: 'galaxy:ismMapFluidStepPass' });
      for (let s = 0; s < steps; s++) {
        const bgA = stepBindGroupsA[s];
        if (bgA) {
          stepPass.setPipeline(velocityPipe);
          stepPass.setBindGroup(0, bgA);
          stepPass.dispatchWorkgroups(dispatchX, dispatchY);
        }
        stepPass.setPipeline(stepPipe);
        stepPass.setBindGroup(0, stepBindGroupsB[s]!);
        stepPass.dispatchWorkgroups(dispatchX, dispatchY);
      }
      stepPass.end();

      // Same even/odd parity as the automaton runner: step 0 only seeds, so
      // the last DISPATCHED step is index steps-1.
      const finalState = (steps - 1) % 2 === 0 ? stateB : stateA;
      const packBG = device.createBindGroup({
        label: 'galaxy:ismMapFluidPackBG',
        layout: packPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: finalState.createView() },
          { binding: 1, resource: output.texture.createView() },
        ],
      });
      const packPass = enc.beginComputePass({ label: 'galaxy:ismMapFluidPackPass' });
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
      velocityTex.destroy();
      constUbo.destroy();
      eventsBuf.destroy();
    },
  };
}
