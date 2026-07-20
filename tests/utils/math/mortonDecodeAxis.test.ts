/**
 * mortonDecodeAxis — the allocation-free single-axis decoder the star cut uses.
 * Its one load-bearing property is that it stays bit-for-bit identical to
 * `mortonDecode3`: the star seam writes each decoded axis into a reused typed
 * array instead of a throwaway Vec3, and a drift between the two decoders would
 * silently jitter every star sprite. So the test cross-checks the per-axis
 * result against the (already-trusted) Vec3 decoder over a spread of codes.
 */
import { describe, it, expect } from 'vitest';
import { mortonDecodeAxis } from '../../../src/utils/math/mortonDecodeAxis';
import { mortonDecode3 } from '../../../src/utils/math/mortonDecode3';
import { mortonEncode3 } from '../../../src/utils/math/mortonEncode3';

describe('mortonDecodeAxis', () => {
  it('matches mortonDecode3 axis-by-axis across the 10-bit range', () => {
    const coords: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1023, 1023, 1023],
      [1023, 0, 0],
      [0, 1023, 0],
      [0, 0, 1023],
      [5, 300, 1000],
      [512, 1, 777],
      [42, 42, 42],
    ];
    for (const [x, y, z] of coords) {
      const code = mortonEncode3(x, y, z);
      const [dx, dy, dz] = mortonDecode3(code);
      expect(mortonDecodeAxis(code, 0)).toBe(dx);
      expect(mortonDecodeAxis(code, 1)).toBe(dy);
      expect(mortonDecodeAxis(code, 2)).toBe(dz);
    }
  });
});
