/**
 * createIsmMapRingReduce — GPU per-ring reductions over the ISM map,
 * starting with `ismMapTex`'s dust-channel row means (`ringReduce.wesl`'s
 * `csRingMeans`, `IsmMapOutput.ringMeansBuffer`'s producer). Built once
 * against the fixed-lifetime texture/buffer `createIsmMapOutput.ts` owns —
 * no per-call rebuild of the bind group, since neither object is ever
 * replaced, only its content changes. Future ring-reductions (survivor-sum,
 * flux-weight sums) grow this file with sibling `dispatchXxx` methods rather
 * than a second module — see the plan's Task 9/15.
 */
import { ISM_MAP_RINGS } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';

import ringReduceWgsl from '../shaders/milkyWay/ismMap/ringReduce.wesl?static';

export type IsmMapRingReduce = {
  /** Encode the ring-means pass into the CALLER's encoder — no submit here, same one-encoder-one-submit contract `IsmMapOutput`'s encode*Pass methods use. */
  dispatchRingMeans(enc: GPUCommandEncoder): void;
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

  return {
    dispatchRingMeans(enc): void {
      const pass = enc.beginComputePass({ label: 'galaxy:ismMapRingMeansPass' });
      pass.setPipeline(ringMeansPipe);
      pass.setBindGroup(0, ringMeansBindGroup);
      pass.dispatchWorkgroups(ISM_MAP_RINGS);
      pass.end();
    },
  };
}
