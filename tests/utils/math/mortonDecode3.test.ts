import { describe, it, expect } from 'vitest';
import { mortonDecode3 } from '../../../src/utils/math/mortonDecode3';
import { mortonEncode3 } from '../../../src/utils/math/mortonEncode3';

describe('mortonDecode3', () => {
  it('decodes hand-computed single-axis codes back to their grid coords', () => {
    // Inverse of the encode contract: bit 0 → x, bit 1 → y, bit 2 → z.
    expect(mortonDecode3(1)).toEqual([1, 0, 0]);
    expect(mortonDecode3(2)).toEqual([0, 1, 0]);
    expect(mortonDecode3(4)).toEqual([0, 0, 1]);
    expect(mortonDecode3(7)).toEqual([1, 1, 1]);
  });

  it('round-trips grid coordinates through encode then decode', () => {
    const coords: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1023, 1023, 1023], // all bits set on every axis
      [1023, 0, 0], // asymmetric: one axis saturated, others zero
      [0, 1023, 0],
      [0, 0, 1023],
      [5, 300, 1000], // asymmetric mix across the 10-bit range
      [512, 1, 777],
      [42, 42, 42],
    ];
    for (const [x, y, z] of coords) {
      expect(mortonDecode3(mortonEncode3(x, y, z))).toEqual([x, y, z]);
    }
  });
});
