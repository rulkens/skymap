/**
 * A 24-bit Windows bitmap from packed RGB pixels, top row first: what NSIS's Modern UI loads for its
 * header and sidebar (no alpha, no compression). BMP stores rows bottom-up, BGR, each padded to 4 bytes.
 */
export function encodeBmp(rgb: Uint8Array, width: number, height: number): Buffer {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const header = 14 + 40;
  const out = Buffer.alloc(header + stride * height);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(header, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    const row = header + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      out[row + x * 3] = rgb[i + 2]!;
      out[row + x * 3 + 1] = rgb[i + 1]!;
      out[row + x * 3 + 2] = rgb[i]!;
    }
  }
  return out;
}
