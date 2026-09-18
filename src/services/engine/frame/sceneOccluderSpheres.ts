/**
 * sceneOccluderSpheres — the frame's opaque bodies (`sceneOccluderBodies`)
 * packed eye-relative in km for the orbit-trail conic fragment's segment test.
 * Capacity and the drop order over it are `selectOccluderSpheresKm`'s.
 * A frame that rendered no `foreground:0` packs NOTHING — nothing drew, so
 * nothing occludes — which is also what keeps the fragment off that frame's
 * coverage texture: it samples it only inside one of these spheres.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { MAX_ORBIT_OCCLUDERS } from '../../../data/bodies/orbitTrailConstants';
import { selectOccluderSpheresKm } from '../../../utils/occlusion/selectOccluderSpheresKm';
import { sceneOccluderBodies } from './sceneOccluderBodies';

// Refilled each frame so the hot path allocates no GPU-bound buffer; the
// renderer copies out of it on the same call.
const spheresKm = new Float32Array(MAX_ORBIT_OCCLUDERS * 4);

export function sceneOccluderSpheres(
  state: PassState,
  ctx: ReadyFrameContext,
): { readonly count: number; readonly spheresKm: Float32Array } {
  if (!ctx.renderedTargets.has('foreground:0')) return { count: 0, spheresKm };
  return {
    count: selectOccluderSpheresKm(
      { occluders: sceneOccluderBodies(state, ctx), camPosMpc: ctx.drawCamPos },
      spheresKm,
    ),
    spheresKm,
  };
}
