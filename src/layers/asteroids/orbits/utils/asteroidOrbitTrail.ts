/**
 * asteroidOrbitTrail — row k's Kepler ellipse as a trail, from the same decoded basis the dot is
 * solved in: position = A·(cos E − e) + B·sin E, so the conic's centre is the Sun − e·A and its axes
 * are A and B. The lobe sits at the row's mean anomaly at `simJd`, which is where the dot is.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { OrbitTrail } from '../../../../@types/rendering/orbitTrailRenderer/OrbitTrail';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

const TAU = 2 * Math.PI;

export function asteroidOrbitTrail(
  catalog: AsteroidCatalog,
  k: number,
  simJd: number,
  sunMpc: Readonly<Vec3>,
  color: Readonly<Vec3>,
  fade: number,
): OrbitTrail {
  const { elementsA: A, elementsB: B } = catalog;
  const au = SCALE_UNITS.AU_TO_MPC;
  const e = A[4 * k + 3]!;
  const axis = (basis: Float32Array): Vec3 => [
    basis[4 * k]! * au,
    basis[4 * k + 1]! * au,
    basis[4 * k + 2]! * au,
  ];
  const semiMajorMpc = axis(A);
  const m = catalog.m0[k]! + B[4 * k + 3]! * (simJd - catalog.epochJd);
  return {
    centerMpc: [
      sunMpc[0] - e * semiMajorMpc[0],
      sunMpc[1] - e * semiMajorMpc[1],
      sunMpc[2] - e * semiMajorMpc[2],
    ],
    semiMajorMpc,
    semiMinorMpc: axis(B),
    eccentricity: e,
    // Wrapped in f64: decades from the epoch, M is hundreds of radians, past what the f32 record keeps.
    meanAnomalyRad: ((m % TAU) + TAU) % TAU,
    color,
    fade,
  };
}
