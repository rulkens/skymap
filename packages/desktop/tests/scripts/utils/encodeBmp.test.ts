import { describe, expect, it } from 'vitest';
import { encodeBmp } from '../../../scripts/utils/encodeBmp';

describe('encodeBmp', () => {
  // 2 × 2: red, green on top; blue, white below. A 6-byte row pads to 8.
  const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const bmp = encodeBmp(rgb, 2, 2);

  it('writes a 24-bit header NSIS can load', () => {
    expect(bmp.toString('ascii', 0, 2)).toBe('BM');
    expect(bmp.readUInt32LE(2)).toBe(bmp.length);
    expect(bmp.length).toBe(54 + 8 * 2);
    expect([bmp.readInt32LE(18), bmp.readInt32LE(22), bmp.readUInt16LE(28)]).toEqual([2, 2, 24]);
  });

  it('stores rows bottom-up as BGR', () => {
    expect([...bmp.subarray(54, 60)]).toEqual([255, 0, 0, 255, 255, 255]);
    expect([...bmp.subarray(62, 68)]).toEqual([0, 0, 255, 0, 255, 0]);
  });
});
