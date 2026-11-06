/**
 * everyFrustumInsideACone — whether each view's frustum (six `frustumPlanesFromViewProj`
 * planes about the eye) lies inside one `occluderConesFrom` cone, so a body hides
 * everything beyond it in every view. The four side-plane edges span the frustum, and a
 * cone of half-angle ≤ 90° is convex, so all four edge rays inside it is enough.
 * No views or no cones: false.
 */

import { FRUSTUM_FLOATS_PER_VIEW } from '../../../data/camera/frustumFloatsPerView';
import { OCCLUDER_CONE_FLOATS } from '../../../data/occlusion/occluderConeFloats';

// Offsets of the side planes (left 0, right 4, bottom 8, top 12) taken as the adjacent
// pairs whose shared edge is a frustum corner ray.
const CORNER_PLANE_PAIRS = [
  [0, 8],
  [8, 4],
  [4, 12],
  [12, 0],
] as const;

export function everyFrustumInsideACone(planes: Float32Array, cones: Float64Array): boolean {
  if (planes.length === 0 || cones.length === 0) return false;
  for (let v = 0; v < planes.length; v += FRUSTUM_FLOATS_PER_VIEW) {
    let inside = false;
    for (let c = 0; c < cones.length && !inside; c += OCCLUDER_CONE_FLOATS) {
      inside = CORNER_PLANE_PAIRS.every(([a, b]) => cornerInCone(planes, v + a, v + b, cones, c));
    }
    if (!inside) return false;
  }
  return true;
}

function cornerInCone(planes: Float32Array, a: number, b: number, cones: Float64Array, c: number) {
  const x = planes[a + 1]! * planes[b + 2]! - planes[a + 2]! * planes[b + 1]!;
  const y = planes[a + 2]! * planes[b]! - planes[a]! * planes[b + 2]!;
  const z = planes[a]! * planes[b + 1]! - planes[a + 1]! * planes[b]!;
  // The edge lies in planes a and b and inside the other two, so it points into the
  // frustum exactly when it has a positive component along the sum of all four inward normals.
  const v = a - (a % FRUSTUM_FLOATS_PER_VIEW);
  let facing = 0;
  for (let p = v; p < v + 16; p += 4) {
    facing += x * planes[p]! + y * planes[p + 1]! + z * planes[p + 2]!;
  }
  const scale = Math.sign(facing) / Math.hypot(x, y, z);
  return (x * cones[c]! + y * cones[c + 1]! + z * cones[c + 2]!) * scale >= cones[c + 3]!;
}
