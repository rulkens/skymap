/**
 * keplerianPositionMpc — place a body on its own orbit: its classical elements
 * → the focus-relative position it occupies at the scene epoch (spec §5).
 *
 * For a bound row this is the single evaluation of `keplerianEllipse`'s affine
 * map `X_off(E) = C + A·cos E + B·sin E` at the body's own `E` (recovered from
 * its stored mean anomaly) — the same three vectors the trail is drawn from, so
 * the body sits ON its trail. An escape trajectory dispatches to the hyperbolic
 * sibling instead. Focus-relative either way; the caller adds the focus.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';
import { keplerianEllipse } from './keplerianEllipse';
import { eccentricAnomalyFromMean } from './eccentricAnomalyFromMean';
import { hyperbolicPositionMpc } from './hyperbolicPositionMpc';

export function keplerianPositionMpc(elements: OrbitalElements): Vec3 {
  // Below is bound-orbit-only: keplerianEllipse's b = a·√(1 − e²) is NaN past
  // e = 1, so an escape trajectory takes the sibling map instead.
  if (elements.eccentricity > 1) return hyperbolicPositionMpc(elements);

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
