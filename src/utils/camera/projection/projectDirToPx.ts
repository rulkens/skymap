/**
 * projectDirToPx — a world direction to device px (y down) through a pinhole
 * view, plus its depth along the view axis. Null behind the camera or within
 * ~3° of the image plane, where the projection runs off to infinity.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Size } from '../../../@types/rendering/Size';
import type { Vec3 } from '../../../@types/math/Vec3';

const MIN_FORWARD = 0.05;

export function projectDirToPx(
  dir: Readonly<Vec3>,
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
): { readonly x: number; readonly y: number; readonly z: number } | null {
  const dot = (a: Readonly<Vec3>): number => dir[0] * a[0] + dir[1] * a[1] + dir[2] * a[2];
  const z = dot(basis.forward);
  if (z < MIN_FORWARD) return null;
  const tx = dot(basis.right) / z;
  const ty = dot(basis.up) / z;
  return {
    x: ((tx - frustum.tanLeft) / (frustum.tanRight - frustum.tanLeft)) * size.width,
    y: ((frustum.tanUp - ty) / (frustum.tanUp - frustum.tanDown)) * size.height,
    z,
  };
}
