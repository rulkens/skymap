import type { AssetLoader } from '../../../@types/AssetLoader';
import type { SceneAsset } from '../../../@types/SceneAsset';
import { loadGaussianSplat } from './loadGaussianSplat';
import { loadPointCloud } from './loadPointCloud';

/** One row per `SceneAsset.kind` — `watchGroupSaga` dispatches every asset load through it. */
export const ASSET_LOADERS: Record<SceneAsset['kind'], AssetLoader> = {
  pointCloud: loadPointCloud,
  gaussianSplat: loadGaussianSplat,
};
