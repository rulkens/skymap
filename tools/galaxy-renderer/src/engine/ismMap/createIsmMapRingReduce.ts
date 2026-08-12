/**
 * createIsmMapRingReduce — GPU per-ring reductions over the ISM map,
 * starting with `ismMapTex`'s dust-channel row means (`ringReduce.wesl`'s
 * `csRingMeans`, `IsmMapOutput.ringMeansBuffer`'s producer). Built once
 * against the fixed-lifetime texture/buffer `createIsmMapOutput.ts` owns —
 * no per-call rebuild of the bind group, since neither object is ever
 * replaced, only its content changes. `dispatchSurvivorSum` (Task 9) is the
 * first of the "future ring-reductions" this header used to promise —
 * `dustRenormBuffer` is a FRESH bind group per call (its own `massBuffer`
 * input comes from `placeDust`, an external object this module has no
 * constructor-time handle on, unlike `ismMapTexture`/`ringMeansBuffer`
 * above).
 */
import { ISM_MAP_RINGS } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

import ringReduceWgsl from '../shaders/milkyWay/ismMap/ringReduce.wesl?static';

const SURVIVOR_SUM_PARAMS_BUFFER_SIZE = 16; // count: u32, totalMass: f32, 2x pad — ringReduce.wesl's SurvivorSumParams

export type DispatchSurvivorSumInput = {
  /** placeDust.wesl's own massOut buffer (`IsmMapPlaceDust.massBuffer`) — producer-owned, passed in fresh each call since its identity never changes but this module has no constructor-time reference to it. */
  readonly massBuffer: GPUBuffer;
  /** This rebuild's dust particle count — `PlaceDustBudget.count`, NOT `MAX_PARTICLE_COUNT`: massBuffer beyond it holds a previous dispatch's stale values. */
  readonly count: number;
  /** `PlaceDustBudget.totalMass` — dustParticleCloud.ts:287's own totalMass, pure geometry/tau function computed CPU-side. */
  readonly totalMass: number;
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

    dispose(): void {
      survivorParamsBuffer.destroy();
      dustRenormBuffer.destroy();
      dustRenormReadbackBuffer.destroy();
    },
  };
}
