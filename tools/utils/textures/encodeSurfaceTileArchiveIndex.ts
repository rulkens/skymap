import type { SurfaceTileArchiveEntry } from '../../../src/layers/body/surfaceTiles/archive/@types/SurfaceTileArchiveEntry';
import {
  SURFACE_TILE_ARCHIVE_ENTRY_BYTES,
  SURFACE_TILE_ARCHIVE_HEADER_BYTES,
  SURFACE_TILE_ARCHIVE_MAGIC,
  SURFACE_TILE_ARCHIVE_VERSION,
} from '../../../src/layers/body/surfaceTiles/archive/data/surfaceTileArchiveFormat';

/** encodeSurfaceTileArchiveIndex — the `.idx` bytes for entries already sorted by key
 *  (the layout is in `surfaceTileArchiveFormat.ts` and the spec). */
export function encodeSurfaceTileArchiveIndex(
  entries: readonly SurfaceTileArchiveEntry[],
  partCount: number,
): Uint8Array {
  const out = new Uint8Array(
    SURFACE_TILE_ARCHIVE_HEADER_BYTES + entries.length * SURFACE_TILE_ARCHIVE_ENTRY_BYTES,
  );
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = SURFACE_TILE_ARCHIVE_MAGIC.charCodeAt(i);
  view.setUint16(4, SURFACE_TILE_ARCHIVE_VERSION, true);
  view.setUint16(6, partCount, true);
  view.setUint32(8, entries.length, true);
  entries.forEach((e, i) => {
    const at = SURFACE_TILE_ARCHIVE_HEADER_BYTES + i * SURFACE_TILE_ARCHIVE_ENTRY_BYTES;
    view.setUint32(at, e.key % 2 ** 32, true);
    view.setUint16(at + 4, Math.floor(e.key / 2 ** 32), true);
    view.setUint16(at + 6, e.part, true);
    view.setUint32(at + 8, e.offset, true);
    view.setUint32(at + 12, e.length, true);
  });
  return out;
}
