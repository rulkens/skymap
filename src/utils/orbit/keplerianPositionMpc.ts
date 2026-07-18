/**
 * keplerianPositionMpc — place a body on its own orbit: turn its classical
 * elements into the single focus-relative position it occupies at the scene
 * epoch (spec §5).
 *
 * ### The one evaluation the whole trail feature rides on
 *
 * `keplerianEllipse` already reduced the orbit to three constant world vectors
 * — centre-offset `C`, semi-major `A`, semi-minor `B` — such that any point on
 * the curve is
 *
 *     X_off(E) = C + A·cos E + B·sin E
 *
 * with the plane angle equal to the eccentric anomaly `E`. This function is the
 * single evaluation of that affine map at the body's own `E`, recovered from
 * its stored mean anomaly via `eccentricAnomalyFromMean` (`M → E` inverts
 * Kepler's equation). Because the body seed (Task 5) and the trail table
 * (Task 7) both derive from the *same* `A`, `B`, `C`, evaluating here at the
 * body's `E` is exactly what makes the body sit on its own rendered trail
 * rather than drifting off it — one map, one curve, one point.
 *
 * ### Focus-relative, like the ellipse it composes
 *
 * The result is offset from the orbit's focus (Sun at the origin, or a parent's
 * world position); the caller adds the focus. Keeping the focus out here is what
 * lets the same map serve a heliocentric orbit and the geocentric Moon without
 * forking — the reason `keplerianEllipse` returns a centre-OFFSET, carried
 * through unchanged.
 *
 * @param elements  The body's J2000 classical elements (a, e, i, Ω, ω, M).
 * @returns The body's equatorial-world position relative to its orbit's focus,
 *          in Mpc — the caller adds the parent's world position.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';
import { keplerianEllipse } from './keplerianEllipse';
import { eccentricAnomalyFromMean } from './eccentricAnomalyFromMean';

export function keplerianPositionMpc(elements: OrbitalElements): Vec3 {
  const { centerOffsetMpc, semiMajorMpc, semiMinorMpc } = keplerianEllipse(elements);
  const eAnom = eccentricAnomalyFromMean(elements.meanAnomalyRad, elements.eccentricity);
  const cosE = Math.cos(eAnom);
  const sinE = Math.sin(eAnom);

  return [
    centerOffsetMpc[0] + semiMajorMpc[0] * cosE + semiMinorMpc[0] * sinE,
    centerOffsetMpc[1] + semiMajorMpc[1] * cosE + semiMinorMpc[1] * sinE,
    centerOffsetMpc[2] + semiMajorMpc[2] * cosE + semiMinorMpc[2] * sinE,
  ];
}
