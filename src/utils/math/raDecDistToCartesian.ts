/**
 * Convert sky coordinates (RA, Dec, distance) to a 3D Cartesian position in Mpc.
 *
 * Sibling to `raDecZToCartesian`: same coordinate convention, but the
 * caller supplies a known distance directly instead of a redshift.  Used
 * for objects with non-redshift distances — Galactic-Local Group members
 * (the Milky Way's own center, M31, M33, the LMC/SMC) where redshift
 * gets dominated by peculiar motion or is meaningless (the Milky Way
 * has no cosmological redshift relative to itself).
 *
 * Coordinate convention (right-handed, equatorial, J2000):
 *   +x → (RA = 0°,  Dec = 0°)   — vernal equinox direction
 *   +y → (RA = 90°, Dec = 0°)
 *   +z → Dec = +90°              — celestial north pole
 *
 * The math is the standard spherical → Cartesian conversion:
 *
 *     x = d · cos(dec) · cos(ra)
 *     y = d · cos(dec) · sin(ra)
 *     z = d · sin(dec)
 *
 * @param raDeg     Right Ascension in degrees, [0, 360).
 * @param decDeg    Declination in degrees, [-90, +90].
 * @param distMpc   Distance in Mpc.  May be small (e.g. 0.008 Mpc = 8 kpc
 *                  for the Galactic center) — the math is unitless except
 *                  for this scalar, so any positive value is fine.
 */
import type { Vec3 } from '../../@types/math/Vec3';

export function raDecDistToCartesian(
  raDeg: number,
  decDeg: number,
  distMpc: number,
): Vec3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  return [
    distMpc * cosDec * Math.cos(ra),
    distMpc * cosDec * Math.sin(ra),
    distMpc * Math.sin(dec),
  ];
}
