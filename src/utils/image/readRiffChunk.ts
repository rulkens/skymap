const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const CHUNK_SIZE_OFFSET = 4;
const FORM_TYPE_OFFSET = 8;

function fourccAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** readRiffChunk — the payload of the first `fourcc` chunk in a RIFF/WEBP file,
 *  or null. Null (not a throw) for non-WebP bytes: a CDN 404 page arrives here. */
export function readRiffChunk(bytes: Uint8Array, fourcc: string): Uint8Array | null {
  if (bytes.length < RIFF_HEADER_BYTES) return null;
  if (fourccAt(bytes, 0) !== 'RIFF' || fourccAt(bytes, FORM_TYPE_OFFSET) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= bytes.length) {
    const size = view.getUint32(offset + CHUNK_SIZE_OFFSET, true);
    const start = offset + CHUNK_HEADER_BYTES;
    if (start + size > bytes.length) return null;
    if (fourccAt(bytes, offset) === fourcc) return bytes.subarray(start, start + size);
    // RIFF pads odd-sized chunks to an even length; the size field excludes the pad.
    offset = start + size + (size & 1);
  }
  return null;
}
