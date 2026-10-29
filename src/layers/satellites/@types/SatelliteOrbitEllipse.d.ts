/**
 * SatelliteOrbitEllipse — a satellite's osculating orbit in the world frame, in the orbit trail
 * renderer's terms: `X(E) = centre + A·cos E + B·sin E` in Mpc, with the satellite at the mean
 * anomaly given (E = 0 at periapsis).
 */
import type { Vec3 } from '../../../@types/math/Vec3';

export type SatelliteOrbitEllipse = {
  readonly centerMpc: Vec3;
  readonly semiMajorMpc: Vec3;
  readonly semiMinorMpc: Vec3;
  readonly eccentricity: number;
  readonly meanAnomalyRad: number;
};
