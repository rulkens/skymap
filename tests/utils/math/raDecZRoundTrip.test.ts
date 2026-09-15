/**
 * Round-trip + spot-check tests for `raDecZToCartesian` and `cartesianToRaDecZ`.
 *
 * These two functions are exact inverses — given (RA, Dec, z), the forward
 * function produces (x, y, z_cart), and the inverse function must recover the
 * same (RA, Dec, z) within floating-point tolerance.  This invariant is the
 * cleanest way to test both at once.  The axis conventions themselves are
 * pinned by `eqRaDecToUnitCart.test.ts`; what round-tripping alone misses —
 * the degenerate origin, the RA wrap, the pole clamp — is pinned below.
 */

import { describe, it, expect } from 'vitest';
import { raDecZToCartesian } from '../../../src/utils/math/raDecZToCartesian';
import { cartesianToRaDecZ } from '../../../src/utils/math/cartesianToRaDecZ';

describe('raDecZToCartesian / cartesianToRaDecZ', () => {
  it('round-trips an SDSS-ish coordinate within 1e-4 tolerance', () => {
    // Pick a typical SDSS galaxy: RA = 188.7°, Dec = +1.4°, z = 0.05.
    // The forward → inverse cycle should reproduce the inputs to within
    // double-precision rounding error scaled by the trig operations.
    const ra = 188.7;
    const dec = 1.4;
    const z = 0.05;
    const [x, y, zc] = raDecZToCartesian(ra, dec, z);
    const [raBack, decBack, zBack] = cartesianToRaDecZ(x, y, zc);
    expect(raBack).toBeCloseTo(ra, 4);
    expect(decBack).toBeCloseTo(dec, 4);
    expect(zBack).toBeCloseTo(z, 4);
  });
});

describe('cartesianToRaDecZ — degenerate inputs', () => {
  it('returns sentinel [0, 0, 0] for the origin', () => {
    // d = 0 means "observer's own position" — RA and Dec are undefined there.
    // The function returns [0, 0, 0] rather than NaN so downstream consumers
    // don't poison further calculations.
    expect(cartesianToRaDecZ(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('wraps the recovered RA into [0, 360) for points in the -y half-plane', () => {
    // atan2(-1, 1) = -π/4. Without the wrap, RA would come back negative.
    // The function adds 2π, producing 315°.
    const [ra] = cartesianToRaDecZ(1, -1, 0);
    expect(ra).toBeGreaterThanOrEqual(0);
    expect(ra).toBeLessThan(360);
    expect(ra).toBeCloseTo(315, 4);
  });

  it('handles dec = +90° without an asin domain error', () => {
    // After computing z/d for a point exactly on the +z axis, the ratio can
    // be 1.0000000000000002 due to the sqrt in d.  The function clamps to
    // [-1, 1] so asin doesn't return NaN.
    const [, dec] = cartesianToRaDecZ(0, 0, 100);
    expect(dec).toBeCloseTo(90, 6);
    expect(Number.isNaN(dec)).toBe(false);
  });
});
