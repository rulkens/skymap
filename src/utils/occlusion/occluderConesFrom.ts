/**
 * occluderConesFrom — each opaque body as the cone of sight lines it blocks from the eye:
 * the unit axis to its centre, the half-angle θ of its inner-bound disc (sin θ = R / D),
 * and its distance D. An eye inside a body's inner bound has no such cone and gets none.
 */

import type { OccluderBody } from '../../@types/scene/OccluderBody';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { OCCLUDER_CONE_FLOATS } from '../../data/occlusion/occluderConeFloats';

export function occluderConesFrom(
  occluders: readonly OccluderBody[],
  eyeMpc: Readonly<Vec3>,
): Float64Array {
  const cones = new Float64Array(occluders.length * OCCLUDER_CONE_FLOATS);
  let n = 0;
  for (const { positionMpc, radiusM } of occluders) {
    const cx = positionMpc[0] - eyeMpc[0];
    const cy = positionMpc[1] - eyeMpc[1];
    const cz = positionMpc[2] - eyeMpc[2];
    const distance = Math.hypot(cx, cy, cz);
    const radius = radiusM * SCALE_UNITS.M_TO_MPC;
    if (distance <= radius) continue;
    const sin = radius / distance;
    cones.set([cx / distance, cy / distance, cz / distance, Math.sqrt(1 - sin * sin), sin, distance], n);
    n += OCCLUDER_CONE_FLOATS;
  }
  return cones.subarray(0, n);
}
