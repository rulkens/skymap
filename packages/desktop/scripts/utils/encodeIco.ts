/**
 * A Windows .ico holding one PNG per square size (Vista and later read PNG entries). The directory
 * stores a size as one byte, so 256 is written as 0.
 */
export function encodeIco(pngBySize: ReadonlyMap<number, Buffer>): Buffer {
  const entries = [...pngBySize].sort(([a], [b]) => a - b);
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(([size, png], i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size % 256, at);
    head.writeUInt8(size % 256, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map(([, png]) => png)]);
}
