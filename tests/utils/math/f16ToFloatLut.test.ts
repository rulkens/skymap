import { describe, it, expect } from 'vitest';
import { f16ToFloatLut } from '../../../src/utils/math/f16ToFloatLut';
import { f16ToFloat } from '../../../src/utils/math/f16ToFloat';

describe('f16ToFloatLut', () => {
  it('agrees with the scalar f16ToFloat reference for every one of the 65536 bit patterns', () => {
    // The LUT's whole correctness argument is "built from f16ToFloat, so it
    // can't diverge" — this is the test that actually proves that for every
    // bit pattern, not just a hand-picked sample (zero, subnormals, ±Inf and
    // NaN are all in range 0..65535, so no special-casing needed here).
    for (let bits = 0; bits < 65536; bits++) {
      const expected = f16ToFloat(bits);
      const actual = f16ToFloatLut(bits);
      if (Number.isNaN(expected)) {
        expect(Number.isNaN(actual)).toBe(true);
      } else {
        expect(actual).toBe(expected);
      }
    }
  });
});
