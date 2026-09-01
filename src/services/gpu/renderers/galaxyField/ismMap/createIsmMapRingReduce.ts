/**
 * createIsmMapRingReduce — GPU per-ring reductions over the ISM map,
 * starting with `ismMapTex`'s dust-channel row means. Built once against the
 * fixed-lifetime texture/buffer `createIsmMapOutput.ts` owns — no per-call
 * bind-group rebuild, since neither object is ever replaced.
 * `dispatchSurvivorSum`'s `dustRenormBuffer` bind group IS rebuilt fresh per
 * call: its `massBuffer` input comes from `placeDust`, external to this
 * module's constructor. The arm/spur cloud flux-weight-sum dispatches are
 * the same shape, one level simpler.
 */
import { ISM_MAP_RINGS } from '../../../../engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

import ringReduceWgsl from '../../../shaders/milkyWay/ismMap/ringReduce.wesl?static';

const SURVIVOR_SUM_PARAMS_BUFFER_SIZE = 16; // count: u32, totalMass: f32, 2x pad — ringReduce.wesl's SurvivorSumParams
const FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE = 16; // count: u32, 3x pad — ringReduce.wesl's FluxWeightSumParams

export type DispatchSurvivorSumInput = {
  /** placeDust.wesl's own massOut buffer (`IsmMapPlaceDust.massBuffer`) — producer-owned, passed in fresh each call since its identity never changes but this module has no constructor-time reference to it. */
  readonly massBuffer: GPUBuffer;
  /** This rebuild's dust particle count — `PlaceDustBudget.count`, NOT `MAX_PARTICLE_COUNT`: massBuffer beyond it holds a previous dispatch's stale values. */
  readonly count: number;
  /** `PlaceDustBudget.totalMass` — dustParticleCloud.ts:287's own totalMass, pure geometry/tau function computed CPU-side. */
  readonly totalMass: number;
};

/** Shared shape for the two flux-weight-sum dispatches below — `fluxWeightBuffer` is the producer's own `fluxWeightOut`, `count` its reservation's live count. */
export type DispatchFluxWeightSumInput = {
  readonly fluxWeightBuffer: GPUBuffer;
  readonly count: number;
};

export type IsmMapRingReduce = {
  /** Encode the ring-means pass into the CALLER's encoder — no submit here, same one-encoder-one-submit contract `IsmMapOutput`'s encode*Pass methods use. */
  dispatchRingMeans(enc: GPUCommandEncoder): void;
  /**
   * Encode the survivor-sum + Larson renorm pass into the CALLER's encoder,
   * same no-submit contract. Must be encoded AFTER whatever `placeDust`
   * dispatch filled `input.massBuffer` for THIS rebuild, in the same
   * encoder/submit — cross-pass ordering within one submit is what
   * guarantees this reads fresh data with no readback of its own
   * (`createGalaxyModel.ts`'s `dustPlacementRebuild` is the production
   * caller). Writes `dustRenormBuffer[0]`.
   */
  dispatchSurvivorSum(enc: GPUCommandEncoder, input: DispatchSurvivorSumInput): void;
  /**
   * `dustRenorm` (dustMap/fragment.wesl binding 14) — the Larson massPerR2
   * scale `dispatchSurvivorSum` writes and the dust splat pass reads, as a
   * storage buffer bound BOTH ways (read_write here, read-only there): no
   * uniform round trip, since the CPU never learns this value.
   */
  readonly dustRenormBuffer: GPUBuffer;
  /** Debug-only: maps `dustRenormBuffer[0]` back to the CPU — the probe's own numeric-validation exception (`readback:placeDust`'s survivor-sum assertion), no production caller. */
  readDustRenormScale(): Promise<number>;
  /**
   * The arm-cloud twin of `dispatchSurvivorSum` — encodes
   * `ringReduce.wesl`'s `csArmCloudFluxWeightSum` into the CALLER's encoder,
   * same no-submit/must-run-after-the-producer-dispatch contract. Writes
   * `armCloudRenormBuffer[0]`.
   */
  dispatchArmCloudFluxWeightSum(enc: GPUCommandEncoder, input: DispatchFluxWeightSumInput): void;
  /** `armCloudRenorm` (fieldSplat/fragment.wesl binding 15) — the reciprocal weightSum scale, read_write here, read-only there. */
  readonly armCloudRenormBuffer: GPUBuffer;
  /** Debug-only: maps `armCloudRenormBuffer[0]` back to the CPU — the probe's own numeric-validation exception, no production caller. */
  readArmCloudRenormScale(): Promise<number>;
  /** The spur-cloud twin of `dispatchArmCloudFluxWeightSum` — same shape, `csArmSpurFluxWeightSum`. */
  dispatchArmSpurFluxWeightSum(enc: GPUCommandEncoder, input: DispatchFluxWeightSumInput): void;
  /** `spurCloudRenorm` (fieldSplat/fragment.wesl binding 16) — the spur-cloud twin of `armCloudRenormBuffer`. */
  readonly spurCloudRenormBuffer: GPUBuffer;
  /** Debug-only twin of `readArmCloudRenormScale`. */
  readArmSpurRenormScale(): Promise<number>;
  dispose(): void;
};

export function createIsmMapRingReduce(
  device: GPUDevice,
  deps: {
    readonly makeShader: (code: string, label: string) => GPUShaderModule;
    readonly ismMapTexture: GPUTexture;
    readonly ringMeansBuffer: GPUBuffer;
  },
): IsmMapRingReduce {
  const mod = deps.makeShader(ringReduceWgsl, 'galaxy:ismMapRingReduce');
  const ringMeansPipe = device.createComputePipeline({
    label: 'galaxy:ismMapRingReduceRingMeansPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csRingMeans' },
  });
  const ringMeansBindGroup = device.createBindGroup({
    label: 'galaxy:ismMapRingReduceRingMeansBG',
    layout: ringMeansPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: deps.ismMapTexture.createView() },
      { binding: 1, resource: { buffer: deps.ringMeansBuffer } },
    ],
  });

  const survivorSumPipe = device.createComputePipeline({
    label: 'galaxy:ismMapRingReduceSurvivorSumPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csSurvivorSum' },
  });
  const survivorParamsBuffer = device.createBuffer({
    label: 'galaxy:ismMapRingReduceSurvivorParams',
    size: SURVIVOR_SUM_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // dustRenormBuffer: STORAGE (this pass's own read_write write) | COPY_SRC
  // (readDustRenormScale's debug readback) — no UNIFORM usage, since
  // dustMap/fragment.wesl binds it as read-only STORAGE too (a storage
  // buffer is readable from a fragment stage; a uniform buffer cannot be
  // GPU-written by a compute pass at a non-256-byte-aligned offset the way
  // io.wesl's shared FieldUniforms header would require).
  const dustRenormBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustRenorm',
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const dustRenormReadbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapDustRenormReadback',
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Arm-cloud/spur-cloud flux-weight-sum kernels, same shape as the
  // survivor-sum pipeline above minus a `totalX` factor (ringReduce.wesl's
  // own doc for why the output is a bare reciprocal).
  const armCloudFluxWeightSumPipe = device.createComputePipeline({
    label: 'galaxy:ismMapRingReduceArmCloudFluxWeightSumPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csArmCloudFluxWeightSum' },
  });
  const armCloudFluxWeightSumParamsBuffer = device.createBuffer({
    label: 'galaxy:ismMapRingReduceArmCloudFluxWeightSumParams',
    size: FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const armCloudRenormBuffer = device.createBuffer({
    label: 'galaxy:ismMapArmCloudRenorm',
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const armCloudRenormReadbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapArmCloudRenormReadback',
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const armSpurFluxWeightSumPipe = device.createComputePipeline({
    label: 'galaxy:ismMapRingReduceArmSpurFluxWeightSumPipe',
    layout: 'auto',
    compute: { module: mod, entryPoint: 'csArmSpurFluxWeightSum' },
  });
  const armSpurFluxWeightSumParamsBuffer = device.createBuffer({
    label: 'galaxy:ismMapRingReduceArmSpurFluxWeightSumParams',
    size: FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const spurCloudRenormBuffer = device.createBuffer({
    label: 'galaxy:ismMapSpurCloudRenorm',
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const spurCloudRenormReadbackBuffer = device.createBuffer({
    label: 'galaxy:ismMapSpurCloudRenormReadback',
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  return {
    dispatchRingMeans(enc): void {
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapRingMeansPass' });
      pass.setPipeline(ringMeansPipe);
      pass.setBindGroup(0, ringMeansBindGroup);
      pass.dispatchWorkgroups(ISM_MAP_RINGS);
      pass.end();
    },

    dispatchSurvivorSum(enc, input): void {
      const buf = new ArrayBuffer(SURVIVOR_SUM_PARAMS_BUFFER_SIZE);
      new Uint32Array(buf)[0] = input.count;
      new Float32Array(buf)[1] = input.totalMass;
      device.queue.writeBuffer(survivorParamsBuffer, 0, buf);
      const bindGroup = device.createBindGroup({
        label: 'galaxy:ismMapRingReduceSurvivorSumBG',
        layout: survivorSumPipe.getBindGroupLayout(0),
        entries: [
          { binding: 2, resource: { buffer: survivorParamsBuffer } },
          { binding: 3, resource: { buffer: input.massBuffer } },
          { binding: 4, resource: { buffer: dustRenormBuffer } },
        ],
      });
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapSurvivorSumPass' });
      pass.setPipeline(survivorSumPipe);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
    },

    dustRenormBuffer,

    async readDustRenormScale(): Promise<number> {
      const enc = device.createCommandEncoder({ label: 'galaxy:dustRenormReadback' });
      enc.copyBufferToBuffer(dustRenormBuffer, 0, dustRenormReadbackBuffer, 0, 4);
      device.queue.submit([enc.finish()]);
      await dustRenormReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
      try {
        return new Float32Array(dustRenormReadbackBuffer.getMappedRange(0, 4).slice(0))[0]!;
      } finally {
        dustRenormReadbackBuffer.unmap();
      }
    },

    dispatchArmCloudFluxWeightSum(enc, input): void {
      const buf = new ArrayBuffer(FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE);
      new Uint32Array(buf)[0] = input.count;
      device.queue.writeBuffer(armCloudFluxWeightSumParamsBuffer, 0, buf);
      const bindGroup = device.createBindGroup({
        label: 'galaxy:ismMapRingReduceArmCloudFluxWeightSumBG',
        layout: armCloudFluxWeightSumPipe.getBindGroupLayout(0),
        entries: [
          { binding: 5, resource: { buffer: armCloudFluxWeightSumParamsBuffer } },
          { binding: 6, resource: { buffer: input.fluxWeightBuffer } },
          { binding: 7, resource: { buffer: armCloudRenormBuffer } },
        ],
      });
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapArmCloudFluxWeightSumPass' });
      pass.setPipeline(armCloudFluxWeightSumPipe);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
    },

    armCloudRenormBuffer,

    async readArmCloudRenormScale(): Promise<number> {
      const enc = device.createCommandEncoder({ label: 'galaxy:armCloudRenormReadback' });
      enc.copyBufferToBuffer(armCloudRenormBuffer, 0, armCloudRenormReadbackBuffer, 0, 4);
      device.queue.submit([enc.finish()]);
      await armCloudRenormReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
      try {
        return new Float32Array(armCloudRenormReadbackBuffer.getMappedRange(0, 4).slice(0))[0]!;
      } finally {
        armCloudRenormReadbackBuffer.unmap();
      }
    },

    dispatchArmSpurFluxWeightSum(enc, input): void {
      const buf = new ArrayBuffer(FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE);
      new Uint32Array(buf)[0] = input.count;
      device.queue.writeBuffer(armSpurFluxWeightSumParamsBuffer, 0, buf);
      const bindGroup = device.createBindGroup({
        label: 'galaxy:ismMapRingReduceArmSpurFluxWeightSumBG',
        layout: armSpurFluxWeightSumPipe.getBindGroupLayout(0),
        entries: [
          { binding: 8, resource: { buffer: armSpurFluxWeightSumParamsBuffer } },
          { binding: 9, resource: { buffer: input.fluxWeightBuffer } },
          { binding: 10, resource: { buffer: spurCloudRenormBuffer } },
        ],
      });
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapArmSpurFluxWeightSumPass' });
      pass.setPipeline(armSpurFluxWeightSumPipe);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
    },

    spurCloudRenormBuffer,

    async readArmSpurRenormScale(): Promise<number> {
      const enc = device.createCommandEncoder({ label: 'galaxy:spurCloudRenormReadback' });
      enc.copyBufferToBuffer(spurCloudRenormBuffer, 0, spurCloudRenormReadbackBuffer, 0, 4);
      device.queue.submit([enc.finish()]);
      await spurCloudRenormReadbackBuffer.mapAsync(GPUMapMode.READ, 0, 4);
      try {
        return new Float32Array(spurCloudRenormReadbackBuffer.getMappedRange(0, 4).slice(0))[0]!;
      } finally {
        spurCloudRenormReadbackBuffer.unmap();
      }
    },

    dispose(): void {
      survivorParamsBuffer.destroy();
      dustRenormBuffer.destroy();
      dustRenormReadbackBuffer.destroy();
      armCloudFluxWeightSumParamsBuffer.destroy();
      armCloudRenormBuffer.destroy();
      armCloudRenormReadbackBuffer.destroy();
      armSpurFluxWeightSumParamsBuffer.destroy();
      spurCloudRenormBuffer.destroy();
      spurCloudRenormReadbackBuffer.destroy();
    },
  };
}
