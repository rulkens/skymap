import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import type { LidarGpuAsset } from './renderResources';

/**
 * Uploads a parsed `points.bin` record array as one instance buffer, stride
 * 16 (spec §5) — the renderer (task 14) owns the pipeline that draws it.
 * `records` is a view onto the downloaded buffer, so `writeBuffer` gets the
 * view (not its backing `ArrayBuffer`): the header bytes sit in front of it.
 */
export function uploadPointCloud(
  gpu: GpuContext,
  records: Uint8Array,
  pointCount: number,
): LidarGpuAsset {
  const vertexBuffer = gpu.device.createBuffer({
    label: `scene-workbench-points-${pointCount}`,
    size: records.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  gpu.device.queue.writeBuffer(vertexBuffer, 0, records);
  return { vertexBuffer, pointCount };
}
