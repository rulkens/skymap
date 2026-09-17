/**
 * Hand-written TIFF byte writers, shared by the GeoTIFF-reader tests. sharp's
 * own TIFF encoder can't round-trip a single-band float32 or 16-bit-sample
 * raster (it forces a 3-band scRGB image, silently zeroing or rescaling the
 * source — the corruption `dhmTerraenHeightSource`'s tests found), so these
 * emit a minimal valid TIFF (8-byte header, one strip, ten IFD tags) by hand.
 */

import { writeFileSync } from 'node:fs';

export function writeFloatTiff(
  path: string,
  width: number,
  height: number,
  values: ArrayLike<number>,
  format: 'float32' | 'int16' = 'float32',
): void {
  const pixels = format === 'int16' ? Int16Array.from(values) : Float32Array.from(values);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const headerSize = 8;
  const ifdOffset = headerSize + pixelBytes.byteLength;
  const entries: ReadonlyArray<readonly [number, number, number, number]> = [
    [256, 3, 1, width], // ImageWidth (SHORT)
    [257, 3, 1, height], // ImageLength (SHORT)
    [258, 3, 1, format === 'int16' ? 16 : 32], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // PhotometricInterpretation: BlackIsZero
    [273, 4, 1, headerSize], // StripOffsets (LONG)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip: one strip
    [279, 4, 1, pixelBytes.byteLength], // StripByteCounts
    [339, 3, 1, format === 'int16' ? 2 : 3], // SampleFormat: signed int / IEEE float
  ];
  const buf = Buffer.alloc(ifdOffset + 2 + entries.length * 12 + 4);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);
  pixelBytes.copy(buf, headerSize);

  let p = ifdOffset;
  buf.writeUInt16LE(entries.length, p);
  p += 2;
  for (const [tag, type, count, value] of entries) {
    buf.writeUInt16LE(tag, p);
    buf.writeUInt16LE(type, p + 2);
    buf.writeUInt32LE(count, p + 4);
    buf.writeUInt32LE(value, p + 8);
    p += 12;
  }
  buf.writeUInt32LE(0, p);

  writeFileSync(path, buf);
}

export function writeGreyTiff(
  path: string,
  width: number,
  height: number,
  values: ArrayLike<number>,
  bits: 8 | 16,
): void {
  const pixels = bits === 8 ? Uint8Array.from(values) : Uint16Array.from(values);
  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const headerSize = 8;
  const ifdOffset = headerSize + pixelBytes.byteLength;
  const entries: ReadonlyArray<readonly [number, number, number, number]> = [
    [256, 3, 1, width], // ImageWidth (SHORT)
    [257, 3, 1, height], // ImageLength (SHORT)
    [258, 3, 1, bits], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // PhotometricInterpretation: BlackIsZero
    [273, 4, 1, headerSize], // StripOffsets (LONG)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, height], // RowsPerStrip: one strip
    [279, 4, 1, pixelBytes.byteLength], // StripByteCounts
    [339, 3, 1, 1], // SampleFormat: unsigned int
  ];
  const buf = Buffer.alloc(ifdOffset + 2 + entries.length * 12 + 4);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);
  pixelBytes.copy(buf, headerSize);

  let p = ifdOffset;
  buf.writeUInt16LE(entries.length, p);
  p += 2;
  for (const [tag, type, count, value] of entries) {
    buf.writeUInt16LE(tag, p);
    buf.writeUInt16LE(type, p + 2);
    buf.writeUInt32LE(count, p + 4);
    buf.writeUInt32LE(value, p + 8);
    p += 12;
  }
  buf.writeUInt32LE(0, p);

  writeFileSync(path, buf);
}
