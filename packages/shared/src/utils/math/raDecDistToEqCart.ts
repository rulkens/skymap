/**
 * Convert a sky coordinate (RA hours, Dec degrees, distance Mpc) into an
 * equatorial-Cartesian Vec3 in Mpc.
 *
 * Right-handed frame, J2000 equatorial:
 *   +X → RA 0 h / Dec 0° (vernal equinox direction)
 *   +Y → RA 6 h / Dec 0°
 *   +Z → Dec +90° (north celestial pole)
 *
 * RA is supplied in HOURS (the standard catalogue convention) and is
 * multiplied by 15 deg/hr before the radian conversion, matching the
 * raHours field of `SkyCoord`.  The resulting positions drop directly
 * into world-space alongside galaxy catalog coordinates and the filament
 * binary — all share this same frame.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { SkyCoord } from '../../@types/data/SkyCoord';

/**
 * Convert (RA hours, Dec degrees, distance Mpc) → equatorial-Cartesian Mpc.
 *
 * Standard spherical → Cartesian:
 *
 *     x = d · cos(RA) · cos(Dec)
 *     y = d · sin(RA) · cos(Dec)
 *     z = d · sin(Dec)
 *
 * where RA is converted from hours to radians via × 15° × π/180.
 */
export function raDecDistToEqCart(c: SkyCoord): Vec3 {
  const RAD = Math.PI / 180;
  const ra = c.raHours * 15 * RAD;
  const dec = c.decDeg * RAD;
  const cd = Math.cos(dec);
  return [c.distMpc * Math.cos(ra) * cd, c.distMpc * Math.sin(ra) * cd, c.distMpc * Math.sin(dec)];
}
