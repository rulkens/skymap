import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';

/**
 * quatFromAxisAngle — unit quaternion for a rotation of `angleRad` about
 * `axis` (must already be unit length). Layout is `[x, y, z, w]`,
 * identity `[0, 0, 0, 1]`.
 */
export function quatFromAxisAngle(axis: Readonly<Vec3>, angleRad: number): Vec4 {
  const half = angleRad / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}
