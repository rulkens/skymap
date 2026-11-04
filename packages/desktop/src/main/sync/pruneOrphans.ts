import { readdir, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { OfflineInventory } from '../../../../../tools/deploy/@types/OfflineInventory';
import { INVENTORY_FILE } from './data/inventoryFile';
import { MIRROR_BOOKKEEPING_FILES } from './data/mirrorBookkeepingFiles';
import { readJsonFile } from '../files/utils/readJsonFile';

/** Deletes every key on disk outside the local inventory.json. Idempotent; a no-op without one. */
export async function pruneOrphans(dataRoot: string): Promise<{ deleted: number }> {
  const inventory = await readJsonFile<OfflineInventory>(join(dataRoot, INVENTORY_FILE));
  if (inventory === null) return { deleted: 0 };
  const keep = new Set(inventory.groups.flatMap((g) => g.files.map((f) => f.key)));
  const entries = await readdir(dataRoot, { recursive: true, withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.part')) continue;
    const path = join(entry.parentPath, entry.name);
    const rel = relative(dataRoot, path).split(sep).join('/');
    const isBookkeeping = (MIRROR_BOOKKEEPING_FILES as readonly string[]).includes(rel);
    if (isBookkeeping || keep.has(`data/${rel}`)) continue;
    await rm(path);
    deleted++;
  }
  return { deleted };
}
