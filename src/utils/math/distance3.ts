import type { Vec3 } from '../../@types/math/Vec3';

/**
 * distance3 — Euclidean distance between two Vec3s, unit-agnostic.
 *
 * Squares in f64, which holds metre-scale Mpc (1e-44) and galaxy-scale kpc alike; not
 * `Math.hypot`, which allocates per call and runs in per-frame label stages. Deliberately unitless
 * (galaxy-generator callers work in kpc/dimensionless model space, not Mpc),
 * so it is not the same helper as `distanceMpc` despite the identical body.
 */
export function distance3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
