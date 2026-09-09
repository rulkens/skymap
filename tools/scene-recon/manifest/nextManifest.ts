/**
 * nextManifest — the `writeJsonAtomic` updater for a group's `manifest.json`.
 * Rebuilds the top-level fields from `group` on every call rather than
 * trusting `current`: a re-bake after an anchor/name edit must overwrite
 * them, not just upsert into whatever `assets[]` a stale manifest already
 * had — `upsertAsset` alone only ever touches `assets[]`.
 */
import { upsertAsset } from './upsertAsset';
import type { SceneGroupDefinition } from '../groups/soendermarken';
import type { SceneAsset } from '../../scene-workbench/@types/SceneAsset';
import type { SceneManifest } from '../../scene-workbench/@types/SceneManifest';

export function nextManifest(
  current: SceneManifest | null,
  group: SceneGroupDefinition,
  asset: SceneAsset,
): SceneManifest {
  return upsertAsset(
    {
      formatVersion: 1,
      groupId: group.id,
      groupName: group.name,
      anchor: group.anchor,
      assets: current?.assets ?? [],
    },
    asset,
  );
}
