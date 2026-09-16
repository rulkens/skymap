const RIFF_HEADER_BYTES = 12;
const SIZE_OFFSET = 4;
const FORM_TYPE_OFFSET = 8;
const CHUNK_HEADER_BYTES = 8;
const VP8X_PAYLOAD_BYTES = 10;
const VP8X_CANVAS_WIDTH_OFFSET = 4;
const VP8X_CANVAS_HEIGHT_OFFSET = 7;

function writeFourcc(out: Uint8Array, offset: number, fourcc: string): void {
  for (let i = 0; i < 4; i++) out[offset + i] = fourcc.charCodeAt(i);
}

function readFourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function writeUint24(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
  view.setUint8(offset + 2, value >>> 16);
}

/**
 * appendWebpChunk — rewrap a simple lossless (VP8L) WebP as extended (VP8X) and
 * append a custom chunk. Unknown chunks are only legal after a VP8X header, and
 * the VP8X flags stay 0 because the custom chunk declares no known feature.
 */
export function appendWebpChunk(
  webp: Uint8Array,
  width: number,
  height: number,
  fourcc: string,
  payload: Uint8Array,
): Uint8Array {
  if (readFourcc(webp, 0) !== 'RIFF' || readFourcc(webp, FORM_TYPE_OFFSET) !== 'WEBP') {
    throw new Error('appendWebpChunk: input is not a RIFF/WEBP file');
  }
  const imageChunk = webp.subarray(RIFF_HEADER_BYTES);
  const imageFourcc = readFourcc(imageChunk, 0);
  if (imageFourcc !== 'VP8L') {
    throw new Error(`appendWebpChunk: expected a simple WebP, found a '${imageFourcc}' chunk`);
  }

  const pad = payload.length & 1;
  const vp8xBytes = CHUNK_HEADER_BYTES + VP8X_PAYLOAD_BYTES;
  const tailBytes = CHUNK_HEADER_BYTES + payload.length + pad;
  const out = new Uint8Array(RIFF_HEADER_BYTES + vp8xBytes + imageChunk.length + tailBytes);
  const view = new DataView(out.buffer);

  writeFourcc(out, 0, 'RIFF');
  view.setUint32(SIZE_OFFSET, out.length - CHUNK_HEADER_BYTES, true);
  writeFourcc(out, FORM_TYPE_OFFSET, 'WEBP');

  let offset = RIFF_HEADER_BYTES;
  writeFourcc(out, offset, 'VP8X');
  view.setUint32(offset + SIZE_OFFSET, VP8X_PAYLOAD_BYTES, true);
  // VP8X stores canvas dimensions minus one.
  writeUint24(view, offset + CHUNK_HEADER_BYTES + VP8X_CANVAS_WIDTH_OFFSET, width - 1);
  writeUint24(view, offset + CHUNK_HEADER_BYTES + VP8X_CANVAS_HEIGHT_OFFSET, height - 1);
  offset += vp8xBytes;

  out.set(imageChunk, offset);
  offset += imageChunk.length;

  writeFourcc(out, offset, fourcc);
  view.setUint32(offset + SIZE_OFFSET, payload.length, true);
  out.set(payload, offset + CHUNK_HEADER_BYTES);
  return out;
}
