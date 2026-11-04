import type { OfflineInventory } from '../../../../tools/deploy/@types/OfflineInventory';
import type { SyncedRecord } from '../@types/SyncedRecord';
import type { SyncPlan } from '../@types/SyncPlan';

/** Per group in inventory order, the files that are unsynced, changed, or gone from disk. */
export function planSync(
  inventory: OfflineInventory,
  synced: SyncedRecord,
  onDisk: ReadonlySet<string>,
): SyncPlan {
  const groups = inventory.groups.map(({ label, files }) => ({
    label,
    download: files.filter((f) => synced[f.key] !== f.sha256 || !onDisk.has(f.key)),
  }));
  const downloadBytes = groups.reduce(
    (sum, g) => sum + g.download.reduce((n, f) => n + f.size, 0),
    0,
  );
  return { groups, downloadBytes };
}
