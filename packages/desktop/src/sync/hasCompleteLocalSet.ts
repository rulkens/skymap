import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { OfflineInventory } from '../../../../tools/deploy/@types/OfflineInventory';
import type { SyncedRecord } from '../@types/SyncedRecord';
import { keyToLocalPath } from '../utils/keyToLocalPath';
import { readJsonFile } from '../utils/readJsonFile';

/** inventory.json present, and every key in it verified in synced.json and on disk. */
export async function hasCompleteLocalSet(dataRoot: string): Promise<boolean> {
  const inventory = await readJsonFile<OfflineInventory>(join(dataRoot, 'inventory.json'));
  if (inventory === null) return false;
  const synced = (await readJsonFile<SyncedRecord>(join(dataRoot, 'synced.json'))) ?? {};
  return inventory.groups.every((g) =>
    g.files.every((f) => synced[f.key] === f.sha256 && existsSync(keyToLocalPath(dataRoot, f.key))),
  );
}
