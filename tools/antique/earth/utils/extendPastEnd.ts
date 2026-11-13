/** extendPastEnd — the point `km` beyond `end` along the great circle from `before` through `end`
 * (a border carried out to sea past the coast, where the plate's land mask trims it). */

import { lonLatDegToDirection } from '../../../../src/utils/geo/lonLatDegToDirection';
import { directionToLonLatDeg } from '../../../../src/utils/geo/directionToLonLatDeg';
import { cross3 } from '../../../../src/utils/math/cross3';
import { normalize3 } from '../../../../src/utils/math/normalize3';

export function extendPastEnd(
  before: readonly [number, number],
  end: readonly [number, number],
  km: number,
  radiusKm: number,
): [number, number] {
  const a = lonLatDegToDirection({ lonDeg: before[0], latDeg: before[1] });
  const b = lonLatDegToDirection({ lonDeg: end[0], latDeg: end[1] });
  const axis = cross3(a, b);
  if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-15) return [end[0], end[1]];
  const n = normalize3(axis);
  // Rotate b about the great circle's pole: b cos θ + (n × b) sin θ.
  const t = cross3(n, b);
  const theta = km / radiusKm;
  const p = normalize3([
    b[0] * Math.cos(theta) + t[0] * Math.sin(theta),
    b[1] * Math.cos(theta) + t[1] * Math.sin(theta),
    b[2] * Math.cos(theta) + t[2] * Math.sin(theta),
  ]);
  const { lonDeg, latDeg } = directionToLonLatDeg(p);
  return [lonDeg, latDeg];
}
