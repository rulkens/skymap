import type { PointCloudAsset } from './PointCloudAsset';

/**
 * SceneAsset — a one-member union, not a bare alias: plans 2–4 add
 * `GaussianSplatAsset`/`MeshAsset`/`CameraPoseSetAsset` as further cases.
 */
export type SceneAsset = PointCloudAsset;
