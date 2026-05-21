/**
 * Round-trip + spot-check tests for `raDecZToCartesian` and `cartesianToRaDecZ`.
 *
 * These two functions are exact inverses — given (RA, Dec, z), the forward
 * function produces (x, y, z_cart), and the inverse function must recover the
 * same (RA, Dec, z) within floating-point tolerance.  This invariant is the
 * cleanest way to test both at once.  We also pin a couple of axis-aligned
 * specials (origin, north pole, equator at RA=0) to catch sign-convention
 * regressions that round-trip alone wouldn't notice.
 */

import { describe, it, expect } from 'vitest';
import { raDecZToCartesian } from '../../../src/utils/math/raDecZToCartesian';
import { cartesianToRaDecZ } from '../../../src/utils/math/cartesianToRaDecZ';
import { redshiftToDistanceMpc } from '../../../src/utils/math/redshiftToDistanceMpc';

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

  it('round-trips a southern-hemisphere coordinate', () => {
    // Dec = -45° is well outside the SDSS footprint but typical for 2MRS/GLADE.
    const ra = 250;
    const dec = -45;
    const z = 0.01;
    const [x, y, zc] = raDecZToCartesian(ra, dec, z);
    const [raBack, decBack, zBack] = cartesianToRaDecZ(x, y, zc);
    expect(raBack).toBeCloseTo(ra, 4);
    expect(decBack).toBeCloseTo(dec, 4);
    expect(zBack).toBeCloseTo(z, 4);
  });

  it('produces the origin for z = 0', () => {
    // d(0) = 0 under any cosmology, so the cartesian point is the origin
    // regardless of (RA, Dec) — they multiply out to zero.
    const [x, y, z] = raDecZToCartesian(123, 45, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it('places (RA=0, Dec=0) on the +x axis', () => {
    // Convention: +x → (RA=0°, Dec=0°). Verify by checking y and z are zero.
    const [x, y, z] = raDecZToCartesian(0, 0, 0.1);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
    // x should equal the Hubble distance × 0.1.
    expect(x).toBeCloseTo(redshiftToDistanceMpc(0.1), 6);
  });

  it('places (RA=90, Dec=0) on the +y axis', () => {
    // Convention: +y → (RA=90°, Dec=0°).
    const [x, y, z] = raDecZToCartesian(90, 0, 0.1);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(redshiftToDistanceMpc(0.1), 6);
  });

  it('places (Dec=+90) on the +z axis (celestial north pole)', () => {
    // Convention: +z → Dec = +90°. RA is degenerate at the pole.
    const [x, y, z] = raDecZToCartesian(0, 90, 0.1);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(redshiftToDistanceMpc(0.1), 6);
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
