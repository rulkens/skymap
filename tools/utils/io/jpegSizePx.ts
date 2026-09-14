/**
 * `[width, height]` of a JPEG from its SOF segment — header walk only, no
 * decode, so checking a few hundred harvested frames costs nothing.
 */
export function jpegSizePx(bytes: Uint8Array): readonly [number, number] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('jpegSizePx: not a JPEG (no SOI marker)');
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error(`jpegSizePx: expected a marker at byte ${i}`);
    // Any number of 0xFF fill bytes may precede the marker code.
    let code = bytes[i + 1]!;
    while (code === 0xff) {
      i += 1;
      code = bytes[i + 1]!;
    }
    i += 2;
    // Standalone markers (RSTn, TEM) carry no length word.
    if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) continue;
    // SOFn is 0xC0-0xCF minus DHT/JPG/DAC, which share the range.
    if (code >= 0xc0 && code <= 0xcf && code !== 0xc4 && code !== 0xc8 && code !== 0xcc) {
      return [(bytes[i + 5]! << 8) | bytes[i + 6]!, (bytes[i + 3]! << 8) | bytes[i + 4]!];
    }
    i += (bytes[i]! << 8) | bytes[i + 1]!;
  }
  throw new Error('jpegSizePx: no SOF segment in the first bytes of the file');
}
