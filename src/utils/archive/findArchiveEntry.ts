import type { ArchiveEntry } from '../../@types/archive/ArchiveEntry';
import type { ArchiveIndex } from '../../@types/archive/ArchiveIndex';
import { ARCHIVE_ENTRY_BYTES, ARCHIVE_HEADER_BYTES } from '../../data/archive/archiveFormat';

/** findArchiveEntry — binary search over the key-sorted entries. */
export function findArchiveEntry(index: ArchiveIndex, key: number): ArchiveEntry | null {
  const { view } = index;
  let lo = 0;
  let hi = index.entryCount - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const at = ARCHIVE_HEADER_BYTES + mid * ARCHIVE_ENTRY_BYTES;
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
