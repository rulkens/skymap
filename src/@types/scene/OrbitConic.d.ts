/**
 * OrbitConic — a bound orbit as an absolute-world ellipse, the shape the screen-space conic
 * fragment consumes (spec §5): `X(E) = centerMpc + semiMajorMpc·cos E + semiMinorMpc·sin E`, so
 * the plane angle IS the eccentric anomaly. `centerMpc` already has the parent's world position
 * folded in; `eccentricity` serves the fragment's E → M mapping, `meanAnomalyRad` places the
 * body's own lobe.
 */

import type { Vec3 } from '../math/Vec3';

export type OrbitConic = {
  readonly centerMpc: Readonly<Vec3>;
  readonly semiMajorMpc: Readonly<Vec3>;
  readonly semiMinorMpc: Readonly<Vec3>;
  readonly eccentricity: number;
  readonly meanAnomalyRad: number;
};
