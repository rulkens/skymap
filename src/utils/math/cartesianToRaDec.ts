/**
 * Convert a 3D Cartesian position in Mpc to sky coordinates (RA, Dec),
 * skipping the redshift component.
 *
 * Why a separate function from `cartesianToRaDecZ`?
 *
 * The full inverse computes z via a LUT lookup on the flat-ΛCDM
 * comoving-distance integral.  That's cheap individually (~12
 * comparisons), but several hot paths — the engine's per-galaxy
 * interleaved-buffer bake, the angular-weights worker, the focus-target
 * resolver, the textured-disk subsystem — call this conversion millions
 * of times and discard the redshift component entirely.  Stripping the
 * unused inverse from those callers saves ~5M LUT lookups per cold load.
 *
 * Sign convention matches `raDecZToCartesian` and `cartesianToRaDecZ`:
 *   - +x → (RA = 0°,  Dec = 0°)
 *   - +y → (RA = 90°, Dec = 0°)
 *   - +z → Dec = +90° (north pole)
 *
 * Edge case — the origin (d = 0): every direction is equally valid, so we
 * return [0, 0] rather than propagating NaN through asin/atan2.
 */

import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Cartesian (x, y, z) in Mpc → [RA in degrees, Dec in degrees].
 *
 * The returned tuple is typed as `Vec3` for compatibility with callers
 * that were previously destructuring `cartesianToRaDecZ`'s return; the
 * third slot is always 0 and should be ignored.  (We could introduce a
 * `Vec2` type, but Vec3 is what the rest of the math module trades in.)
 */
export function cartesianToRaDec(x: number, y: number, z: number): Vec3 {
  const d = Math.sqrt(x * x + y * y + z * z);
  if (d === 0) return [0, 0, 0];

  // Recover Dec: z_cart = d · sin(dec).  Clamp z/d into [-1, 1] before asin
  // because floating-point rounding can push the ratio to 1.0000000000000002
  // for points originally at Dec = ±90°, which would otherwise yield NaN.
  const decRad = Math.asin(Math.max(-1, Math.min(1, z / d)));

  // Recover RA via atan2 so we get the full (-π, π] range and avoid a
  // divide-by-zero when x = 0.  Wrap negatives into [0, 2π) to match the
  // [0°, 360°) convention used by astronomical catalogs.
  let raRad = Math.atan2(y, x);
  if (raRad < 0) raRad += 2 * Math.PI;

  const TO_DEG = 180 / Math.PI;
  return [raRad * TO_DEG, decRad * TO_DEG, 0];
}
