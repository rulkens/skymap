import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { packMaskPolygon } from './packMaskPolygon';
import type { MeshGpuAsset } from './renderResources';

/** Uploads the preview-mask ring, growing `asset.mask` by reallocation — no corner cap. The
 *  renderer keys its bind group by the buffer, so a swap here rebuilds the group. */
export function writeMeshMask(
  device: GPUDevice,
  asset: MeshGpuAsset,
  ringM: readonly Vec2[] | null,
): void {
  const bytes = packMaskPolygon(ringM);
  if (bytes.byteLength > asset.mask.size) {
    const grown = device.createBuffer({
      label: 'scene-workbench-mesh-mask',
      size: bytes.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    asset.mask.destroy();
    asset.mask = grown;
  }
  device.queue.writeBuffer(asset.mask, 0, bytes);
}
