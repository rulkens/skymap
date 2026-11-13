/**
 * asteroidHelioAu — row k's heliocentric position at `simJd` (TT), equatorial J2000, in AU: the
 * compute pass's maths in f64, from the same decoded f32 basis, so follow, card and ring sit on the dot.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidCatalog } from '../../catalog/@types/AsteroidCatalog';
import { solveKeplerFixed } from '../../../../utils/orbit/solveKeplerFixed';

export function asteroidHelioAu(catalog: AsteroidCatalog, k: number, simJd: number): Vec3 {
  const { elementsA: A, elementsB: B } = catalog;
  const e = A[4 * k + 3]!;
  const n = B[4 * k + 3]!;
  const E = solveKeplerFixed(catalog.m0[k]! + n * (simJd - catalog.epochJd), e);
  const x = Math.cos(E) - e;
  const y = Math.sin(E);
  return [
    A[4 * k]! * x + B[4 * k]! * y,
    A[4 * k + 1]! * x + B[4 * k + 1]! * y,
    A[4 * k + 2]! * x + B[4 * k + 2]! * y,
  ];
}
