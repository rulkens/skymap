/**
 * Where a group's fetched frames live under `data/raw/skraafoto/` — layout
 * rules: `data/raw/skraafoto/README.md`.
 */
import { join } from 'node:path';

import type { SceneGroupDefinition } from '../../scene-recon/@types/SceneGroupDefinition';

export function skraafotoHarvestDir(skraafotoDir: string, group: SceneGroupDefinition): string {
  const collectionDir = join(skraafotoDir, group.skraafoto.collection);
  return group.skraafoto.groundMmPerPx === undefined
    ? collectionDir
    : join(collectionDir, group.id);
}
