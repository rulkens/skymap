import { describe, expect, it } from 'vitest';
import { encodeIco } from '../../../scripts/utils/encodeIco';

describe('encodeIco', () => {
  const big = Buffer.from('png-256');
  const small = Buffer.from('png-16');
  const ico = encodeIco(
    new Map([
      [256, big],
      [16, small],
    ]),
  );

  it('lists the sizes smallest first, 256 written as 0', () => {
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect([ico[6], ico[7], ico[22], ico[23]]).toEqual([16, 16, 0, 0]);
  });

  it('points each entry at its own PNG bytes', () => {
    const at = (i: number) => {
      const off = ico.readUInt32LE(6 + 16 * i + 12);
      return ico.subarray(off, off + ico.readUInt32LE(6 + 16 * i + 8)).toString();
    };
    expect([at(0), at(1)]).toEqual(['png-16', 'png-256']);
  });
});
