import type { Vec3 } from '../../@types/math/Vec3';
import { dot3 } from './dot3';

/** projectOntoPlane3 — `v` with its component along the UNIT `normal` removed. */
export function projectOntoPlane3(v: Readonly<Vec3>, normal: Readonly<Vec3>): Vec3 {
  const along = dot3(v, normal);
  return [v[0] - along * normal[0], v[1] - along * normal[1], v[2] - along * normal[2]];
}
