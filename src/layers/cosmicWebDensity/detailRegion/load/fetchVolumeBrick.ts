import type { ArchiveEntry } from '../../../../@types/archive/ArchiveEntry';
import { readArchiveRange } from '../../../../utils/archive/readArchiveRange';

/** One brick: `readArchiveRange` (HTTP cache, ruling 10), `DecompressionStream('gzip')` (precedent
 *  `src/data/starCatalog/starBinCodec.ts`), then a length check. null = failed; 'no-range' is
 *  reported once per field by the caller. Never called for a zero-length entry. */
export async function fetchVolumeBrick(
  url: string,
  entry: Pick<ArchiveEntry, 'offset' | 'length'>,
  brickBytes: number,
): Promise<Uint8Array | 'no-range' | null> {
  const read = await readArchiveRange(url, entry);
  if (read.kind !== 'bytes') return read.kind === 'no-range' ? 'no-range' : null;
  try {
    const inflated = new Response(read.bytes).body!.pipeThrough(new DecompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(inflated).arrayBuffer());
    return bytes.byteLength === brickBytes ? bytes : null;
  } catch {
    return null;
  }
}
