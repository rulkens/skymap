import type { ArchiveEntry } from '../../../src/@types/archive/ArchiveEntry';
import {
  ARCHIVE_ENTRY_BYTES,
  ARCHIVE_HEADER_BYTES,
  ARCHIVE_MAGIC,
  ARCHIVE_VERSION,
} from '../../../src/data/archive/archiveFormat';

/** encodeArchiveIndex — the `.idx` bytes for entries already sorted by key
 *  (the layout is in `archiveFormat.ts` and the spec). */
export function encodeArchiveIndex(
  entries: readonly ArchiveEntry[],
  partCount: number,
): Uint8Array {
  const out = new Uint8Array(ARCHIVE_HEADER_BYTES + entries.length * ARCHIVE_ENTRY_BYTES);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = ARCHIVE_MAGIC.charCodeAt(i);
  view.setUint16(4, ARCHIVE_VERSION, true);
  view.setUint16(6, partCount, true);
  view.setUint32(8, entries.length, true);
  entries.forEach((e, i) => {
    const at = ARCHIVE_HEADER_BYTES + i * ARCHIVE_ENTRY_BYTES;
    view.setUint32(at, e.key % 2 ** 32, true);
    view.setUint16(at + 4, Math.floor(e.key / 2 ** 32), true);
    view.setUint16(at + 6, e.part, true);
    view.setUint32(at + 8, e.offset, true);
    view.setUint32(at + 12, e.length, true);
  });
  return out;
}
