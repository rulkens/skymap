/**
 * Convert a 3D Cartesian position in Mpc back to sky coordinates (RA, Dec, z).
 *
 * This is the exact inverse of raDecZToCartesian, using the same equatorial
 * right-handed convention. It is useful for:
 *   - Displaying sky coordinates on hover for synthetic data (which only stores
 *     xyz positions in the GPU buffer).
 *   - Sanity-checking the forward conversion via round-trip tests.
 *
 * Inversion steps:
 *   1. d = √(x² + y² + z²)         — recover the distance in Mpc
 *   2. z_redshift = distanceMpcToRedshift(d)  — bisect the ΛCDM integral
 *   3. dec = asin(z_cart / d)       — recover declination, range [-90, +90]
 *   4. ra  = atan2(y, x)            — recover RA, then wrap to [0, 360)
 *
 * Why atan2 rather than atan(y/x)?
 *   atan only returns values in (-90°, +90°) and loses sign information when
 *   both y and x change sign together. atan2(y, x) uses both arguments to
 *   return the full [-180°, +180°] range and handles x = 0 without a
 *   divide-by-zero.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { distanceMpcToRedshift } from './distanceMpcToRedshift';

/**
 * Convert Cartesian (x, y, z) in Mpc → (RA in degrees, Dec in degrees, redshift).
 *
 * This is the exact inverse of `raDecZToCartesian`, using the same equatorial
 * right-handed convention:
 *   - +x → (RA = 0°,  Dec = 0°)
 *   - +y → (RA = 90°, Dec = 0°)
 *   - +z → Dec = +90° (north pole)
 *
 * Inversion steps:
 *   1. d = √(x² + y² + z²)                — recover the distance in Mpc
 *   2. z_redshift = d / (c/H₀)            — invert Hubble's law
 *   3. dec = asin(z_cart / d)              — recover declination, range [-90, +90]
 *   4. ra  = atan2(y, x)                   — recover right ascension, then wrap to [0, 360)
 *
 * Why `atan2` rather than `atan(y/x)`?
 *   `atan` only returns values in (-90°, +90°) and loses sign information when
 *   both y and x change sign together. `atan2(y, x)` uses both arguments to
 *   return the full [-180°, +180°] range and handles x = 0 without a
 *   divide-by-zero.
 *
 * Edge case — origin (d = 0):
 *   z = 0 means the observer's own position. There is no meaningful RA or Dec
 *   for the origin itself (every direction is equally valid), so we return the
 *   sentinel [0, 0, 0] rather than propagating NaN through asin/atan2.
 *
 * @param x  Cartesian x in Mpc (equatorial, right-handed).
 * @param y  Cartesian y in Mpc.
 * @param z  Cartesian z in Mpc (note: this is the *spatial* z, not redshift).
 * @returns  [raDeg, decDeg, zRedshift] — RA in [0, 360), Dec in [-90, +90], z ≥ 0.
 */
export function cartesianToRaDecZ(x: number, y: number, z: number): Vec3 {
  const d = Math.sqrt(x * x + y * y + z * z);

  // Guard against the degenerate origin — asin(0/0) and atan2(0,0) are both
  // well-defined in JS (returning 0 and 0 respectively), but dividing by d=0
  // would give NaN for the redshift. Return the agreed sentinel instead.
  if (d === 0) return [0, 0, 0];

  // Invert the forward distance relation.  `distanceMpcToRedshift` reads
  // the `USE_LCDM_DISTANCES` flag in constants.ts and bisects the ΛCDM
  // Simpson integral when set; otherwise it returns `d · H₀ / c`.
  const zRedshift = distanceMpcToRedshift(d);

  // Recover Dec: z_cart = d · sin(dec)  →  dec = asin(z_cart / d)
  // We clamp z/d to [-1, +1] before passing to asin because floating-point
  // arithmetic can produce values like 1.0000000000000002 when d is computed
  // from a point that was originally at Dec = ±90°, causing asin to return NaN.
  const decRad = Math.asin(Math.max(-1, Math.min(1, z / d)));

  // Recover RA: x = d·cos(dec)·cos(ra), y = d·cos(dec)·sin(ra)
  // → ra = atan2(y, x)  (the cos(dec) factor cancels in both numerator and
  //   denominator, so we don't need to divide it out explicitly).
  // atan2 returns values in (-π, +π]; we want [0, 2π) to match the [0°, 360°)
  // convention used by astronomical catalogs, so we add 2π when negative.
  let raRad = Math.atan2(y, x);
  if (raRad < 0) raRad += 2 * Math.PI;

  const TO_DEG = 180 / Math.PI;
  return [raRad * TO_DEG, decRad * TO_DEG, zRedshift];
}
