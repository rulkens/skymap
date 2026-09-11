/**
 * nextManifest — the `writeJsonAtomic` updater for a group's `manifest.json`.
 * Rebuilds the top-level fields from `group` on every call rather than
 * trusting `current`: a re-bake after an anchor/name edit must overwrite
 * them, not just upsert into whatever `assets[]` a stale manifest already
 * had — `upsertAsset` alone only ever touches `assets[]`. `boundsM` is the
 * exception: only the LiDAR bake measures it, so the other bakes pass none
 * and carry the manifest's own forward.
 */
import { upsertAsset } from './upsertAsset';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { SceneAsset } from '../../scene-workbench/@types/SceneAsset';
import type { BoundsM } from '../../scene-workbench/@types/BoundsM';
import type { SceneManifest } from '../../scene-workbench/@types/SceneManifest';

export function nextManifest(
  current: SceneManifest | null,
  group: SceneGroupDefinition,
  asset: SceneAsset,
  boundsM?: BoundsM,
): SceneManifest {
  return upsertAsset(
    {
      formatVersion: 1,
      groupId: group.id,
      groupName: group.name,
      anchor: group.anchor,
      boundsM: boundsM ?? current?.boundsM,
      assets: current?.assets ?? [],
    },
    asset,
  );
}
