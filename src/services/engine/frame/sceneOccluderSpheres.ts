/**
 * sceneOccluderSpheres — the frame's opaque bodies (`sceneOccluderBodies`)
 * packed eye-relative in km for the orbit-trail conic fragment's segment test.
 * Capacity and the drop order over it are `selectOccluderSpheresKm`'s.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { MAX_ORBIT_OCCLUDERS } from '../../../data/bodies/orbitTrailConstants';
import { selectOccluderSpheresKm } from '../../../utils/occlusion/selectOccluderSpheresKm';
import { sceneOccluderBodies } from './sceneOccluderBodies';

// Refilled each frame so the hot path allocates no GPU-bound buffer; the
// renderer copies out of it on the same call.
const spheresKm = new Float32Array(MAX_ORBIT_OCCLUDERS * 4);

export function sceneOccluderSpheres(
  state: PassState,
  ctx: FrameView,
): { readonly count: number; readonly spheresKm: Float32Array } {
  return {
    count: selectOccluderSpheresKm(
      { occluders: sceneOccluderBodies(state, ctx), camPosMpc: ctx.drawCamPos },
      spheresKm,
    ),
    spheresKm,
  };
}
