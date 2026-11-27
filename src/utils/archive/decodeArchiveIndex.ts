import type { ArchiveIndex } from '../../@types/archive/ArchiveIndex';
import {
  ARCHIVE_ENTRY_BYTES,
  ARCHIVE_HEADER_BYTES,
  ARCHIVE_MAGIC,
  ARCHIVE_VERSION,
} from '../../data/archive/archiveFormat';

/** decodeArchiveIndex — reads the header and checks the size; throws on a
 *  wrong magic, an unknown version or a truncated entry table. */
export function decodeArchiveIndex(bytes: Uint8Array): ArchiveIndex {
  if (bytes.byteLength < ARCHIVE_HEADER_BYTES) {
    throw new Error('archive index truncated');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== ARCHIVE_MAGIC) throw new Error(`archive index magic "${magic}"`);
  const version = view.getUint16(4, true);
  if (version !== ARCHIVE_VERSION) throw new Error(`archive index version ${version}`);
  const entryCount = view.getUint32(8, true);
  const size = ARCHIVE_HEADER_BYTES + entryCount * ARCHIVE_ENTRY_BYTES;
  if (bytes.byteLength < size) throw new Error('archive index entry table truncated');
  return { partCount: view.getUint16(6, true), entryCount, view };
}
