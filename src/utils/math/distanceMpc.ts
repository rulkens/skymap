import type { Vec3 } from '../../@types/math/Vec3';

/**
 * distanceMpc — Euclidean distance between two world positions in Mpc.
 *
 * `Math.hypot` (not a hand-rolled `Math.sqrt(dx*dx + …)`) because it guards the
 * intermediate squares against overflow/underflow across the many decades of
 * magnitude foreground work spans — a body seed sits at ~1e-11 Mpc while the
 * camera can rest at ~1e6 Mpc. The proximity demand/release edges of the
 * `bodyTextures` family compare this distance against a per-body load radius,
 * so it is the one shared spelling of "how far is the camera from this body".
 */
export function distanceMpc(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
