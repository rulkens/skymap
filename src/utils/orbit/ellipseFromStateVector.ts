/**
 * ellipseFromStateVector — the osculating Kepler ellipse through a position/velocity pair about a
 * focus of gravitational parameter `mu` (any consistent units; km and km³/s² for Earth). Null for
 * an open orbit (e ≥ 1) or a degenerate state (zero radius or angular momentum).
 * Below NEAR_CIRCULAR_E the eccentricity vector is noise, so periapsis is taken at the body itself
 * (E = 0 there); the ellipse still passes through it and differs from the true orbit by ~a·e.
 */
import type { StateVectorEllipse } from '../../@types/orbit/StateVectorEllipse';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';

const NEAR_CIRCULAR_E = 1e-7;
const TAU = 2 * Math.PI;

export function ellipseFromStateVector(
  r: Readonly<Vec3>,
  v: Readonly<Vec3>,
  mu: number,
): StateVectorEllipse | null {
  const rLen = Math.hypot(r[0], r[1], r[2]);
  const h = cross3(r, v);
  if (rLen === 0 || Math.hypot(h[0], h[1], h[2]) === 0) return null;

  const energy = dot3(v, v) / 2 - mu / rLen;
  if (!(energy < 0)) return null;
  const a = -mu / (2 * energy);

  const vh = cross3(v, h);
  const eVec: Vec3 = [vh[0] / mu - r[0] / rLen, vh[1] / mu - r[1] / rLen, vh[2] / mu - r[2] / rLen];
  const e = Math.hypot(eVec[0], eVec[1], eVec[2]);
  if (e >= 1) return null;

  const p = e < NEAR_CIRCULAR_E ? normalize3(r) : normalize3(eVec);
  const q = cross3(normalize3(h), p);
  const sqrt1me2 = Math.sqrt(1 - e * e);

  const trueAnomaly = Math.atan2(dot3(r, q), dot3(r, p));
  const eccentricAnomaly = Math.atan2(sqrt1me2 * Math.sin(trueAnomaly), e + Math.cos(trueAnomaly));
  const meanAnomaly = eccentricAnomaly - e * Math.sin(eccentricAnomaly);

  const b = a * sqrt1me2;
  return {
    centerOffset: [-a * e * p[0], -a * e * p[1], -a * e * p[2]],
    semiMajor: [a * p[0], a * p[1], a * p[2]],
    semiMinor: [b * q[0], b * q[1], b * q[2]],
    eccentricity: e,
    meanAnomalyRad: ((meanAnomaly % TAU) + TAU) % TAU,
  };
}
