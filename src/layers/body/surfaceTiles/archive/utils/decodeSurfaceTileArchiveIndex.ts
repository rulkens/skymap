import type { SurfaceTileArchiveIndex } from '../@types/SurfaceTileArchiveIndex';
import {
  SURFACE_TILE_ARCHIVE_ENTRY_BYTES,
  SURFACE_TILE_ARCHIVE_HEADER_BYTES,
  SURFACE_TILE_ARCHIVE_MAGIC,
  SURFACE_TILE_ARCHIVE_VERSION,
} from '../data/surfaceTileArchiveFormat';

/** decodeSurfaceTileArchiveIndex — reads the header and checks the size; throws on a
 *  wrong magic, an unknown version or a truncated entry table. */
export function decodeSurfaceTileArchiveIndex(bytes: Uint8Array): SurfaceTileArchiveIndex {
  if (bytes.byteLength < SURFACE_TILE_ARCHIVE_HEADER_BYTES) {
    throw new Error('archive index truncated');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== SURFACE_TILE_ARCHIVE_MAGIC) throw new Error(`archive index magic "${magic}"`);
  const version = view.getUint16(4, true);
  if (version !== SURFACE_TILE_ARCHIVE_VERSION) throw new Error(`archive index version ${version}`);
  const entryCount = view.getUint32(8, true);
  const size = SURFACE_TILE_ARCHIVE_HEADER_BYTES + entryCount * SURFACE_TILE_ARCHIVE_ENTRY_BYTES;
  if (bytes.byteLength < size) throw new Error('archive index entry table truncated');
  return { partCount: view.getUint16(6, true), entryCount, view };
}
