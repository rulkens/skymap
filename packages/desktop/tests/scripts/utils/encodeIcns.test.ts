import { describe, expect, it } from 'vitest';
import { ICNS_SLOTS } from '../../../scripts/data/icnsSlots';
import { encodeIcns } from '../../../scripts/utils/encodeIcns';

const pngs = new Map(ICNS_SLOTS.map(([, size]) => [size, Buffer.from(`png-${size}`)]));

describe('encodeIcns', () => {
  it('chains every slot after a header holding the total length', () => {
    const icns = encodeIcns(pngs);
    expect(icns.toString('ascii', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const found: string[] = [];
    for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
      found.push(
        `${icns.toString('ascii', at, at + 4)} ${icns.toString('ascii', at + 8, at + icns.readUInt32BE(at + 4))}`,
      );
    }
    expect(found).toEqual(ICNS_SLOTS.map(([type, size]) => `${type} png-${size}`));
  });

  it('refuses a missing size rather than writing a short icon', () => {
    const short = new Map(pngs);
    short.delete(1024);
    expect(() => encodeIcns(short)).toThrow(/1024/);
  });
});
