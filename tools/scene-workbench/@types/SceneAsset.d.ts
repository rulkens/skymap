import type { GaussianSplatAsset } from './GaussianSplatAsset';
import type { PointCloudAsset } from './PointCloudAsset';

/**
 * SceneAsset — plans 3–4 add `MeshAsset`/`CameraPoseSetAsset` as further
 * cases; every dispatch on `kind` is a table, never a branch (`assetCount`).
 */
export type SceneAsset = PointCloudAsset | GaussianSplatAsset;
