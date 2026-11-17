/**
 * sphereInAnyFrustum — whether a sphere touches any view's frustum, given each
 * view's six `frustumPlanesFromViewProj` planes. Over-keeps near the apex
 * (a sphere test against planes); never drops a visible sphere. No views means
 * no cull.
 */

import { FRUSTUM_FLOATS_PER_VIEW } from '../../../data/camera/frustumFloatsPerView';

const PLANE_FLOATS = 4;

export function sphereInAnyFrustum(
  planes: Float32Array,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  if (planes.length === 0) return true;
  for (let v = 0; v < planes.length; v += FRUSTUM_FLOATS_PER_VIEW) {
    let p = v;
    const end = v + FRUSTUM_FLOATS_PER_VIEW;
    while (
      p < end &&
      planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! >= -radius
    ) {
      p += PLANE_FLOATS;
    }
    if (p === end) return true;
  }
  return false;
}
