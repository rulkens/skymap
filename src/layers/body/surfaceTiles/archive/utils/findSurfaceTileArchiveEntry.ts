import type { SurfaceTileArchiveEntry } from '../@types/SurfaceTileArchiveEntry';
import type { SurfaceTileArchiveIndex } from '../@types/SurfaceTileArchiveIndex';
import {
  SURFACE_TILE_ARCHIVE_ENTRY_BYTES,
  SURFACE_TILE_ARCHIVE_HEADER_BYTES,
} from '../data/surfaceTileArchiveFormat';

/** findSurfaceTileArchiveEntry — binary search over the key-sorted entries. */
export function findSurfaceTileArchiveEntry(
  index: SurfaceTileArchiveIndex,
  key: number,
): SurfaceTileArchiveEntry | null {
  const { view } = index;
  let lo = 0;
  let hi = index.entryCount - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const at = SURFACE_TILE_ARCHIVE_HEADER_BYTES + mid * SURFACE_TILE_ARCHIVE_ENTRY_BYTES;
    const found = view.getUint32(at, true) + view.getUint16(at + 4, true) * 2 ** 32;
    if (found === key) {
      return {
        key,
        part: view.getUint16(at + 6, true),
        offset: view.getUint32(at + 8, true),
        length: view.getUint32(at + 12, true),
      };
    }
    if (found < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
