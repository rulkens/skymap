import type { ArchiveEntry } from '../../../src/@types/archive/ArchiveEntry';

/** planArchiveParts — assigns part + offset in key order; a new part starts
 *  when the next entry would exceed `maxPartBytes`. `tiles` must be sorted by key. */
export function planArchiveParts(
  tiles: readonly { readonly key: number; readonly length: number }[],
  maxPartBytes: number,
): { readonly entries: ArchiveEntry[]; readonly partCount: number } {
  const entries: ArchiveEntry[] = [];
  let part = 0;
  let offset = 0;
  let previous = -1;
  for (const { key, length } of tiles) {
    if (key <= previous) throw new Error(`planArchiveParts: key ${key} is not above ${previous}`);
    previous = key;
    if (length > maxPartBytes) {
      throw new Error(
        `planArchiveParts: entry ${key} is ${length} B, over the ${maxPartBytes} B part cap`,
      );
    }
    if (offset + length > maxPartBytes) {
      part++;
      offset = 0;
    }
    entries.push({ key, part, offset, length });
    offset += length;
  }
  return { entries, partCount: entries.length === 0 ? 0 : part + 1 };
}
