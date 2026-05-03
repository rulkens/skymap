/**
 * Convert sky coordinates (RA, Dec, redshift) to a 3D Cartesian position in Mpc.
 *
 * SDSS gives each object's position on the sky as (RA, Dec) — two angles —
 * plus a redshift `z` that tells us how far away it is. To render in 3D we
 * need (x, y, z) in a Cartesian frame. This function performs that conversion.
 *
 * The axis convention is right-handed equatorial:
 *   +x → (RA = 0°,  Dec = 0°)   — vernal equinox direction
 *   +y → (RA = 90°, Dec = 0°)
 *   +z → Dec = +90°              — celestial north pole
 *
 * The formula is spherical → Cartesian with radius = redshiftToDistanceMpc(z):
 *
 *     x = d · cos(dec) · cos(ra)
 *     y = d · cos(dec) · sin(ra)
 *     z = d · sin(dec)
 */

import { redshiftToDistanceMpc } from './redshiftToDistanceMpc';

/**
 * Convert (RA, Dec, z) → Cartesian (x, y, z) in Mpc.
 *
 * Convention (right-handed, equatorial):
 *   - +x points to (RA = 0°,   Dec = 0°)   — vernal equinox direction
 *   - +y points to (RA = 90°,  Dec = 0°)
 *   - +z points to  Dec = +90°            — celestial north pole
 *
 * The math is just spherical → Cartesian with the radius set to the
 * Hubble distance for redshift z:
 *
 *     x = d · cos(dec) · cos(ra)
 *     y = d · cos(dec) · sin(ra)
 *     z = d · sin(dec)
 *
 * @param raDeg  Right Ascension in *degrees* (SDSS catalogs use degrees, not hours).
 * @param decDeg Declination in degrees, [-90, +90].
 * @param z      Redshift (dimensionless). z = 0 returns the origin.
 */
export function raDecZToCartesian(
  raDeg: number,
  decDeg: number,
  z: number,
): [number, number, number] {
  const d = redshiftToDistanceMpc(z);
  // Math.cos / Math.sin take radians; SDSS gives us degrees.
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [d * cosDec * Math.cos(ra), d * cosDec * Math.sin(ra), d * Math.sin(dec)];
}
