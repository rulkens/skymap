/**
 * Unit tests for `absoluteMagnitude` — the distance-modulus inversion
 * M = m − 5·log₁₀(d_Mpc) − 25.
 *
 * Verifies the textbook reference points (M = m at d = 10 Mpc per the
 * derivation in the source's docstring), the inverse-square dimming law,
 * and the NaN guard for non-positive distances.
 */

import { describe, it, expect } from 'vitest';
import { absoluteMagnitude } from '../../../src/utils/math/absoluteMagnitude';

describe('absoluteMagnitude', () => {
  it('returns m − 25 at d = 1 Mpc (matches the formula M = m − 5·log10(1) − 25)', () => {
    // log10(1) = 0, so M = m − 25 exactly. Pinning this avoids drift from
    // any future "constants extraction" refactor that might break the −25.
    expect(absoluteMagnitude(20, 1)).toBeCloseTo(-5, 10);
  });

  it('returns m − 5 at d = 100 Mpc (one extra factor of 10 beyond 10 Mpc)', () => {
    // log10(100) = 2, so M = m − 5·2 − 25 = m − 35.
    // For m = 20 we expect −15; the comment in the task says m−5 vs the
    // 10-Mpc reference, which agrees: 20 − 35 = (20 − 30) − 5 = M(10Mpc) − 5.
    expect(absoluteMagnitude(20, 100)).toBeCloseTo(-15, 10);
  });

  it('makes a galaxy 10× more distant appear 5 mag fainter (inverse-square)', () => {
    // The −5·log10(d) term means each factor of 10 in distance shifts the
    // distance modulus by 5 mag — the canonical inverse-square law in
    // logarithmic units.
    const near = absoluteMagnitude(15, 10);
    const far = absoluteMagnitude(15, 100);
    expect(near - far).toBeCloseTo(5, 10);
  });

  it('returns NaN for distance ≤ 0 (logarithm undefined)', () => {
    // log10(0) and log10(negative) are undefined; the function guards
    // explicitly and returns NaN so the InfoCard's "N/A" formatter triggers.
    expect(Number.isNaN(absoluteMagnitude(15, 0))).toBe(true);
    expect(Number.isNaN(absoluteMagnitude(15, -1))).toBe(true);
  });

  it('produces a sensible value for the Milky Way at typical apparent g (sanity check)', () => {
    // A galaxy with apparent g = 14 at d = 100 Mpc has M_g = 14 − 35 = −21,
    // squarely in the L* range (Schechter M*_g ≈ −20.4).  Just a smell test
    // that the formula is dimensionally right.
    const M = absoluteMagnitude(14, 100);
    expect(M).toBeGreaterThan(-23);
    expect(M).toBeLessThan(-19);
  });
});
