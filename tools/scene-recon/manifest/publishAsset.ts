/**
 * publishAsset — the one write path from a finished bake to what the viewer
 * reads: the group's `manifest.json`, then the `scenes.json` registry. Both go
 * through `writeJsonAtomic`, so a bake composes with a concurrently running
 * one (or the nudge endpoint) instead of clobbering it.
 */
import { groupManifestPath, registryPath } from './geo3dLayout';
import { nextManifest } from './nextManifest';
import { upsertGroup } from './upsertGroup';
import { writeJsonAtomic } from '../../utils/io/writeJsonAtomic';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { GroupRegistry } from '../../scene-workbench/@types/GroupRegistry';
import type { SceneAsset } from '../../scene-workbench/@types/SceneAsset';
import type { SceneManifest } from '../../scene-workbench/@types/SceneManifest';

export async function publishAsset(group: SceneGroupDefinition, asset: SceneAsset): Promise<void> {
  await writeJsonAtomic<SceneManifest>(groupManifestPath(group.id), (current) =>
    nextManifest(current, group, asset),
  );

  await writeJsonAtomic<GroupRegistry>(registryPath(), (current) =>
    upsertGroup(current ?? { formatVersion: 1, groups: [] }, {
      id: group.id,
      name: group.name,
      manifestUrl: `geo3d/groups/${group.id}/manifest.json`,
    }),
  );
}
