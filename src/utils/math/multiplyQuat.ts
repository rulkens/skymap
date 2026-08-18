import type { Vec4 } from '../../@types/math/Vec4';

/**
 * multiplyQuat — Hamilton product `a ∘ b`: apply `b`, then `a`. Layout
 * is `[x, y, z, w]`, identity `[0, 0, 0, 1]`.
 */
export function multiplyQuat(a: Readonly<Vec4>, b: Readonly<Vec4>): Vec4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
