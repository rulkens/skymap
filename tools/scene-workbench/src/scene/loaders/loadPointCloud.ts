import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { GpuAsset } from '../../render/renderResources';
import { uploadPointCloud } from '../../render/uploadPointCloud';
import { parsePoints } from '../parsePoints';

/** The `pointCloud` row of `ASSET_LOADERS` — decode `points.bin`, then upload it. */
export function loadPointCloud(gpu: GpuContext, buffer: ArrayBuffer): GpuAsset {
  const { pointCount, records } = parsePoints(buffer);
  return uploadPointCloud(gpu, records, pointCount);
}
