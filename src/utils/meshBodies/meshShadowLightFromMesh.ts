/**
 * meshShadowLightFromMesh — the orthographic sun camera of one mesh body's shadow slot, in its
 * MESH frame (the frame its vertex positions are in): x, y across the bounding sphere in
 * [−1, 1], depth 0 at the sunward pole to 1 at the far one. Not reversed-Z: the shadow pass
 * is its own depth convention. Built in the mesh frame, not host axes, so a slot rendered for
 * one sun direction keeps matching its texels while the body turns under it.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';
import { normalize3 } from '../math/normalize3';

export function meshShadowLightFromMesh(sunDirMesh: Readonly<Vec3>, radiusM: number): Float64Array {
  const s = sunDirMesh;
  // Any axis well away from the sun completes the basis; which one only spins the slot's image.
  const reference: Vec3 = Math.abs(s[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = normalize3(cross3(reference, s));
  const b = cross3(s, a);
  const xy = 1 / radiusM;
  const z = -1 / (2 * radiusM);
  // Column-major: row 0 is a/R, row 1 b/R, row 2 −s/2R + 0.5.
  // prettier-ignore
  return new Float64Array([
    a[0] * xy, b[0] * xy, s[0] * z, 0,
    a[1] * xy, b[1] * xy, s[1] * z, 0,
    a[2] * xy, b[2] * xy, s[2] * z, 0,
    0, 0, 0.5, 1,
  ]);
}
