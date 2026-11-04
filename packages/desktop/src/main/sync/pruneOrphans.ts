import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { OfflineInventory } from '../../../../../tools/deploy/@types/OfflineInventory';
import { INVENTORY_FILE } from './data/inventoryFile';
import { keyToLocalPath } from './utils/keyToLocalPath';
import { listMirrorKeys } from './utils/listMirrorKeys';
import { readJsonFile } from '../files/utils/readJsonFile';

/** Deletes every key on disk outside the local inventory.json and returns how many. A no-op without one. */
export async function pruneOrphans(dataRoot: string): Promise<number> {
  const inventory = await readJsonFile<OfflineInventory>(join(dataRoot, INVENTORY_FILE));
  if (inventory === null) return 0;
  const keep = new Set(inventory.groups.flatMap((g) => g.files.map((f) => f.key)));
  const orphans = [...(await listMirrorKeys(dataRoot))].filter((key) => !keep.has(key));
  for (const key of orphans) await rm(keyToLocalPath(dataRoot, key));
  return orphans.length;
}
