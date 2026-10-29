/**
 * StateVectorEllipse — an osculating orbit as `X(E) = C + A·cos E + B·sin E` about the focus (the
 * `keplerianEllipse` convention), in the length unit of the state vector it came from. `meanAnomalyRad`
 * is the body's own mean anomaly in [0, 2π), measured from periapsis (E = 0 at `semiMajor`).
 */
import type { Vec3 } from '../math/Vec3';

export type StateVectorEllipse = {
  readonly centerOffset: Vec3;
  readonly semiMajor: Vec3;
  readonly semiMinor: Vec3;
  readonly eccentricity: number;
  readonly meanAnomalyRad: number;
};
