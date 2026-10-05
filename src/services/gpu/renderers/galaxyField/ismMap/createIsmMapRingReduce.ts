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
import type { IsmMapRingReduce } from '../../../../../@types/galaxy/IsmMapRingReduce';

const SURVIVOR_SUM_PARAMS_BUFFER_SIZE = 16; // count: u32, totalMass: f32, 2x pad — ringReduce.wesl's SurvivorSumParams
const FLUX_WEIGHT_SUM_PARAMS_BUFFER_SIZE = 16; // count: u32, 3x pad — ringReduce.wesl's FluxWeightSumParams

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
