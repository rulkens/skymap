import type { Vec3 } from '../../@types/math/Vec3';

/**
 * distance3 — Euclidean distance between two Vec3s, unit-agnostic.
 *
 * `Math.hypot` guards the intermediate squares against overflow/underflow,
 * matching `distanceMpc`'s reasoning — but this one is deliberately unitless
 * (galaxy-generator callers work in kpc/dimensionless model space, not Mpc),
 * so it is not the same helper as `distanceMpc` despite the identical body.
 */
export function distance3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
