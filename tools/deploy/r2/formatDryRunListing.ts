import type { R2SyncGroup } from '../@types/R2SyncGroup';

/**
 * The per-object upload policy `sync-r2 --dry-run` prints, one tab-separated
 * line per file sorted by key. Its byte-for-byte stability is the instrument
 * that proves a refactor of the groups left every key, cache header, purge
 * and wire encoding where it was — so the line format never changes.
 */
export function formatDryRunListing(groups: readonly R2SyncGroup[]): string[] {
  return groups
    .flatMap((group) =>
      group.files.map(({ r2Key }) => {
        return {
          r2Key,
          line: `${r2Key}\t${group.transport.kind}\t${group.cacheControl}\tpurge=${group.purge}\tgzip=${group.gzipOnWire}`,
        };
      }),
    )
    .sort((a, b) => (a.r2Key < b.r2Key ? -1 : a.r2Key > b.r2Key ? 1 : 0))
    .map(({ line }) => line);
}
