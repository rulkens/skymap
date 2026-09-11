/**
 * Focus-relative position on a hyperbola, in Mpc — the `e > 1` counterpart of
 * `keplerianPositionMpc`'s ellipse evaluation. Same affine map, cosh/sinh for
 * cos/sin, over the ellipse's own perifocal axes (orientation does not care
 * about the conic's shape):
 *
 *     X(H) = −a·e·P̂w  +  a·cosh H·P̂w  −  a·√(e² − 1)·sinh H·Q̂w
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { Vec3 } from '../../@types/math/Vec3';
import { perifocalAxesWorld } from './perifocalAxesWorld';
import { hyperbolicAnomalyFromMean } from './hyperbolicAnomalyFromMean';

export function hyperbolicPositionMpc(elements: OrbitalElements): Vec3 {
  // a is NEGATIVE for a hyperbola: that is what keeps the periapsis distance
  // a·(1 − e) positive. The explicit minus on the Q̂w term cancels it, so the
  // coefficient stays positive and prograde, like the ellipse's +a·√(1 − e²).
  const a = elements.semiMajorMpc;
  const e = elements.eccentricity;
  const { pWorld, qWorld } = perifocalAxesWorld(elements);

  const hAnom = hyperbolicAnomalyFromMean(elements.meanAnomalyRad, e);
  const alongP = a * Math.cosh(hAnom) - a * e;
  const alongQ = -a * Math.sqrt(e * e - 1) * Math.sinh(hAnom);

  return [
    alongP * pWorld[0] + alongQ * qWorld[0],
    alongP * pWorld[1] + alongQ * qWorld[1],
    alongP * pWorld[2] + alongQ * qWorld[2],
  ];
}
