import type { Vec3 } from '../../../../../../src/@types/math/Vec3';

export function withAxis(vec: Vec3, axis: number, value: number): Vec3 {
  const next: Vec3 = [...vec];
  next[axis] = value;
  return next;
}
