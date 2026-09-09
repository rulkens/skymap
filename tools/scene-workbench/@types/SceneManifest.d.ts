import type { GroupAnchor } from './GroupAnchor';
import type { SceneAsset } from './SceneAsset';

/** Shape of a group's `manifest.json` — a data file, not TypeScript. The single
 *  read-modify-write target for both the bake CLIs and the nudge endpoint. */
export type SceneManifest = {
  readonly formatVersion: 1;
  readonly groupId: string;
  readonly groupName: string;
  readonly anchor: GroupAnchor;
  readonly assets: readonly SceneAsset[];
};
