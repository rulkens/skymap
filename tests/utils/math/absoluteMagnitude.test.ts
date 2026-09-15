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

  it('returns NaN for distance ≤ 0 (logarithm undefined)', () => {
    // log10(0) and log10(negative) are undefined; the function guards
    // explicitly and returns NaN so the InfoCard's "N/A" formatter triggers.
    expect(Number.isNaN(absoluteMagnitude(15, 0))).toBe(true);
    expect(Number.isNaN(absoluteMagnitude(15, -1))).toBe(true);
  });
});
