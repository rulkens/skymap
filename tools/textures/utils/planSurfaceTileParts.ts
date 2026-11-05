import type { SurfaceTileArchiveEntry } from '../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileArchiveEntry';

/** planSurfaceTileParts — assigns part + offset in key order; a new part starts
 *  when the next tile would exceed `maxPartBytes`. `tiles` must be sorted by key. */
export function planSurfaceTileParts(
  tiles: readonly { readonly key: number; readonly length: number }[],
  maxPartBytes: number,
): { readonly entries: SurfaceTileArchiveEntry[]; readonly partCount: number } {
  const entries: SurfaceTileArchiveEntry[] = [];
  let part = 0;
  let offset = 0;
  for (const { key, length } of tiles) {
    if (length > maxPartBytes) {
      throw new Error(
        `planSurfaceTileParts: tile ${key} is ${length} B, over the ${maxPartBytes} B part cap`,
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
