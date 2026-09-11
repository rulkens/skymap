import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { SplatGpuAsset } from '../../render/renderResources';
import { uploadGaussianSplat } from '../../render/uploadGaussianSplat';
import { parseSplats } from '../parseSplats';

/** The `gaussianSplat` row of `ASSET_LOADERS` — decode `splats.bin`, then upload it. */
export function loadGaussianSplat(gpu: GpuContext, buffer: ArrayBuffer): SplatGpuAsset {
  return uploadGaussianSplat(gpu, parseSplats(buffer));
}
