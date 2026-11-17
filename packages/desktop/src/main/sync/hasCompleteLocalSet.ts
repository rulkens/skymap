import { join } from 'node:path';
import type { OfflineInventory } from '../../../../../tools/deploy/@types/OfflineInventory';
import type { SyncedRecord } from './@types/SyncedRecord';
import { INVENTORY_FILE } from './data/inventoryFile';
import { SYNCED_FILE } from './data/syncedFile';
import { listMirrorKeys } from './utils/listMirrorKeys';
import { readJsonFile } from '../files/utils/readJsonFile';

/** inventory.json present, and every key in it verified in synced.json and on disk. */
export async function hasCompleteLocalSet(dataRoot: string): Promise<boolean> {
  const inventory = await readJsonFile<OfflineInventory>(join(dataRoot, INVENTORY_FILE));
  if (inventory === null) return false;
  const synced = (await readJsonFile<SyncedRecord>(join(dataRoot, SYNCED_FILE))) ?? {};
  const onDisk = await listMirrorKeys(dataRoot);
  return inventory.groups.every((g) =>
    g.files.every((f) => synced[f.key] === f.sha256 && onDisk.has(f.key)),
  );
}
