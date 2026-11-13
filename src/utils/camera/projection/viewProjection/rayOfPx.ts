/**
 * rayOfPx — the world direction through a device pixel (y down) of a
 * `ViewProjection`, or null outside a fisheye's disc. Not unit length: the
 * pinhole arm returns `rayThroughPx`'s unit-depth ray, which stays exact under
 * bilinear blending; normalise where a unit vector is needed. `pxOfRay` inverts it.
 */

import type { ViewProjection } from '../../../../@types/camera/projection/ViewProjection';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { fisheyeDirection } from '../../../dome/fisheyeDirection';
import { rotateVec3ByTightMat3 } from '../../../math/rotateVec3ByTightMat3';
import { rayThroughPx } from '../rayThroughPx';

export function rayOfPx(proj: ViewProjection, px: Readonly<Vec2>): Vec3 | null {
  if (proj.kind === 'rectilinear') return rayThroughPx(px, proj.basis, proj.frustum, proj.size);
  const { centrePx: c, radiusPx: r } = proj;
  const dome = fisheyeDirection((px[0] - c[0]) / r, (c[1] - px[1]) / r);
  return dome && rotateVec3ByTightMat3(proj.basis, dome);
}
