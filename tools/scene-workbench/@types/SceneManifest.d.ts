import type { BoundsM } from './BoundsM';
import type { GroupAnchor } from './GroupAnchor';
import type { SceneAsset } from './SceneAsset';

/** Shape of a group's `manifest.json` — a data file, not TypeScript. The single
 *  read-modify-write target for both the bake CLIs and the nudge endpoint. */
export type SceneManifest = {
  readonly formatVersion: 1;
  readonly groupId: string;
  readonly groupName: string;
  readonly anchor: GroupAnchor;
  /** Written by bake-lidar: the extent the LiDAR was cut to. Optional because
   *  manifests baked before it exist on disk. */
  readonly boundsM?: BoundsM;
  readonly assets: readonly SceneAsset[];
};
