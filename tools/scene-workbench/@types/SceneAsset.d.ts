import type { PointCloudAsset } from './PointCloudAsset';

/**
 * SceneAsset — a one-member union, not a bare alias: plans 2–4 add
 * `GaussianSplatAsset`/`MeshAsset`/`CameraPoseSetAsset` as further cases.
 * `PhotoPose` (the `cameraPoseSet` member's pose list) waits for plan 3's
 * pose overlay — minting it now would be a type nothing constructs.
 */
export type SceneAsset = PointCloudAsset;
