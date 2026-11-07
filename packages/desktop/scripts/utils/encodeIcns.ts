import { ICNS_SLOTS } from '../data/icnsSlots';

/** A macOS .icns from PNGs by pixel size; every size in ICNS_SLOTS must be given. */
export function encodeIcns(pngBySize: ReadonlyMap<number, Buffer>): Buffer {
  const chunks = ICNS_SLOTS.map(([type, size]) => {
    const png = pngBySize.get(size);
    if (png === undefined) throw new Error(`icns: no ${size} px PNG for ${type}`);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}
