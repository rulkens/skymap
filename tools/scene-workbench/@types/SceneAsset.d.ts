import type { GaussianSplatAsset } from './GaussianSplatAsset';
import type { PointCloudAsset } from './PointCloudAsset';
import type { TexturedMeshAsset } from './TexturedMeshAsset';

/**
 * SceneAsset — plan 3b adds `CameraPoseSetAsset` as a further case; every
 * dispatch on `kind` is a table, never a branch (`assetCount`).
 */
export type SceneAsset = PointCloudAsset | GaussianSplatAsset | TexturedMeshAsset;
