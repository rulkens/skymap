/**
 * Where a group's fetched frames live under `data/raw/skraafoto/`.
 *
 * A whole-frame harvest is keyed by collection alone — its pixels depend on
 * nothing but the flight, so every whole-frame group shares one download. A
 * cropped harvest is keyed by the group as well: two groups' crops of one item
 * hold different pixels under the same item id, and would overwrite each other.
 */
import { join } from 'node:path';

import type { SceneGroupDefinition } from '../../scene-recon/@types/SceneGroupDefinition';

export function skraafotoHarvestDir(skraafotoDir: string, group: SceneGroupDefinition): string {
  const collectionDir = join(skraafotoDir, group.skraafoto.collection);
  return group.skraafoto.groundMmPerPx === undefined
    ? collectionDir
    : join(collectionDir, group.id);
}
