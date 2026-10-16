import type { Vec3 } from '../../@types/math/Vec3';

/**
 * The distance along `dirToEye` from `target` at which the eye is outside the sphere: `distance`
 * itself when it already is, else the ray's exit root for a target inside the sphere, and the
 * entry root (in front of the sphere) for one outside it. The far root there would hide the target
 * behind the sphere and, written back as a zoom, pin every later notch at that same far side.
 */
export function distanceOutsideSphere(
  target: Readonly<Vec3>,
  dirToEye: Readonly<Vec3>,
  distance: number,
  centre: Readonly<Vec3>,
  radius: number,
): number {
  const px = target[0] - centre[0];
  const py = target[1] - centre[1];
  const pz = target[2] - centre[2];
  const b = px * dirToEye[0] + py * dirToEye[1] + pz * dirToEye[2];
  const c = px * px + py * py + pz * pz - radius * radius;
  if (distance * distance + 2 * b * distance + c >= 0) return distance;
  return c > 0 ? -b - Math.sqrt(b * b - c) : -b + Math.sqrt(b * b - c);
}
