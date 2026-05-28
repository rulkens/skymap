/**
 * Unit tests for `distanceMpcToRedshift`.
 *
 * The function inverts the flat-ΛCDM comoving-distance integral by
 * bisection.  We verify the boundary cases and the round-trip property
 * `distance → z → distance` to a precision tighter than the forward
 * Simpson integral's own error budget.
 */

import { describe, it, expect } from 'vitest';
import { distanceMpcToRedshift } from '../../../src/utils/math/distanceMpcToRedshift';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

describe('distanceMpcToRedshift', () => {
  it('returns 0 for d ≤ 0', () => {
    expect(distanceMpcToRedshift(0)).toBe(0);
    expect(distanceMpcToRedshift(-100)).toBe(0);
  });

  it('round-trips through redshiftToDistanceMpc within LUT precision', () => {
    // The LUT samples z at Δz ≈ 0.003 and linearly interpolates between
    // neighbours; round-trip error is dominated by the LUT's curvature-
    // induced bias and lands in the 1e-7 to 1e-6 range.  Precision 5
    // (absolute diff < 5e-6) covers it comfortably while staying well
    // tighter than anything physically meaningful.
    for (const z of [0.001, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 7.0]) {
      const d = redshiftToDistanceMpc(z);
      const zBack = distanceMpcToRedshift(d);
      expect(zBack).toBeCloseTo(z, 5);
    }
  });

  it('is monotonic in d', () => {
    let prev = -1;
    for (let d = 0; d <= 9000; d += 250) {
      const z = distanceMpcToRedshift(d);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
  });

  it('saturates at the bracket ceiling for distances past the horizon', () => {
    // The bracket caps at z = 12; anything beyond returns the ceiling
    // rather than running off to infinity.  This guards against bad
    // upstream data without throwing.
    const huge = 100_000;
    expect(distanceMpcToRedshift(huge)).toBe(12);
  });
});
