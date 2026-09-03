import type { PointCloudAsset } from './PointCloudAsset';

/**
 * SceneAsset — a one-member union in this plan (plan 1, LiDAR end-to-end).
 * Written as a union, not a bare alias, so plans 2–4 add `GaussianSplatAsset`
 * / `MeshAsset` / `CameraPoseSetAsset` as further union cases rather than a
 * rewrite. `PhotoPose` (the `cameraPoseSet` member's pose list) arrives with
 * plan 3's pose overlay — minting it now would be a type nothing constructs.
 */
export type SceneAsset = PointCloudAsset;
