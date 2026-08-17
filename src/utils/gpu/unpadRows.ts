/**
 * unpadRows — undoes the row padding `copyTextureToBuffer` forces on every
 * WebGPU CPU readback: WebGPU requires `bytesPerRow` to be a multiple of 256
 * bytes, so a texture whose real row width isn't already aligned gets copied
 * into a buffer with dead bytes at the end of each row. Skip this step and
 * the image shears — each row samples a few texels into the next.
 */
export function unpadRows(
  padded: Uint8Array,
  paddedBytesPerRow: number,
  rowBytes: number,
  rows: number,
): Uint8Array {
  const packed = new Uint8Array(rowBytes * rows);
  for (let row = 0; row < rows; row++) {
    packed.set(
      padded.subarray(row * paddedBytesPerRow, row * paddedBytesPerRow + rowBytes),
      row * rowBytes,
    );
  }
  return packed;
}
