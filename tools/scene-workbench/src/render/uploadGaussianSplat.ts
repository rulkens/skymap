import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { ParsedGaussianSplats } from '../scene/parseSplats';
import type { SplatGpuAsset } from './renderResources';

/**
 * Uploads a parsed `splats.bin` as the three buffers the splat pipeline binds.
 * `records`/`sh1` are views onto the downloaded buffer, so `writeBuffer` gets
 * the view (the header sits in front of it). `order` starts as the identity
 * permutation: the first frame then draws in on-disk order rather than
 * nothing, before the depth sort has ever run.
 */
export function uploadGaussianSplat(gpu: GpuContext, parsed: ParsedGaussianSplats): SplatGpuAsset {
  const { splatCount, shDegree, records, positionsM } = parsed;

  const data = gpu.device.createBuffer({
    label: `scene-workbench-splats-${splatCount}`,
    size: records.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  gpu.device.queue.writeBuffer(data, 0, records);

  const uploadSh1 = (block: Uint8Array): GPUBuffer => {
    const buffer = gpu.device.createBuffer({
      label: `scene-workbench-splats-sh1-${splatCount}`,
      size: block.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    gpu.device.queue.writeBuffer(buffer, 0, block);
    return buffer;
  };
  const sh1 = parsed.sh1 === null ? null : uploadSh1(parsed.sh1);

  const identity = new Uint32Array(splatCount);
  for (let i = 0; i < splatCount; i++) identity[i] = i;
  const order = gpu.device.createBuffer({
    label: `scene-workbench-splats-order-${splatCount}`,
    size: identity.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  gpu.device.queue.writeBuffer(order, 0, identity);

  return {
    kind: 'gaussianSplat',
    data,
    sh1,
    order,
    positionsM,
    splatCount,
    shDegree,
    dispose: () => {
      data.destroy();
      sh1?.destroy();
      order.destroy();
    },
  };
}
