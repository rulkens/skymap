import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { OfflineInventory } from '../@types/OfflineInventory';
import type { R2SyncGroup } from '../@types/R2SyncGroup';

/**
 * The files a desktop mirror must hold, from the groups flagged `offline`, in table order.
 * An empty offline group means its bake never ran here; publishing would make every desktop
 * prune files that still sit on R2, so it throws instead.
 */
export function buildOfflineInventory(groups: readonly R2SyncGroup[]): OfflineInventory {
  return {
    groups: groups
      .filter((g) => g.offline)
      .map((g) => {
        if (g.files.length === 0) {
          throw new Error(
            `Offline group "${g.label}" has no files; refusing to publish the inventory.`,
          );
        }
        return {
          label: g.label,
          files: g.files.map(({ localPath, r2Key }) => {
            const bytes = readFileSync(localPath);
            return {
              key: r2Key,
              size: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            };
          }),
        };
      }),
  };
}
