import type { GpuContext } from '../../../src/@types/rendering/GpuContext';
import type { GpuAsset } from '../src/render/renderResources';

/** Fetch → parse → upload for one `SceneAsset.kind`; `ASSET_LOADERS` dispatches on it. */
export type AssetLoader = (gpu: GpuContext, buffer: ArrayBuffer) => GpuAsset;
