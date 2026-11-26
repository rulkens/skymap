import type { ArchiveEntry } from '../../@types/archive/ArchiveEntry';
import type { ArchiveRangeRead } from '../../@types/archive/ArchiveRangeRead';
import { ARCHIVE_FETCH_DEADLINE_MS } from '../../data/archive/archiveFetchDeadlineMs';

/**
 * readArchiveRange — one single-span GET with the shared deadline, through the HTTP cache. Only a
 * 206 of exactly `entry.length` bytes is 'bytes'; a 200's body is cancelled so a whole pack is not
 * downloaded. Throws on length 0: `bytes=o-(o-1)` is not a valid Range.
 */
export async function readArchiveRange(
  url: string,
  entry: Pick<ArchiveEntry, 'offset' | 'length'>,
): Promise<ArchiveRangeRead> {
  if (entry.length === 0) throw new Error(`readArchiveRange: zero-length entry at ${url}`);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(ARCHIVE_FETCH_DEADLINE_MS),
      headers: { Range: `bytes=${entry.offset}-${entry.offset + entry.length - 1}` },
    });
    if (res.status !== 206) {
      void res.body?.cancel();
      return { kind: res.status === 200 ? 'no-range' : 'failed' };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength === entry.length ? { kind: 'bytes', bytes } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
