/**
 * viewBehindABody — whether one opaque body's disc covers this view's whole frustum, so
 * nothing beyond that body can show in it (a camera low over Earth, looking down). The
 * disc is the body's INNER bound, so relief and atmosphere never count as cover.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import { FRUSTUM_FLOATS_PER_VIEW } from '../../../data/camera/frustumFloatsPerView';
import { everyFrustumInsideACone } from '../../../utils/camera/frustum/everyFrustumInsideACone';
import { frustumPlanesFromViewProj } from '../../../utils/camera/frustum/frustumPlanesFromViewProj';
import { rebaseViewProj } from '../../../utils/camera/projection/rebaseViewProj';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { occluderConesFrom } from '../../../utils/occlusion/occluderConesFrom';
import { sceneOccluderBodies } from './sceneOccluderBodies';

export function viewBehindABody(state: PassState, ctx: FrameView, slabIndex: number): boolean {
  const cones = occluderConesFrom(sceneOccluderBodies(state, ctx), ctx.drawCamPos);
  if (cones.length === 0) return false;
  // Planes and cones about the eye, so only directions matter and any slab's vp serves.
  const planes = frustumPlanesFromViewProj(
    narrowMat4(rebaseViewProj(ctx.slabs[slabIndex]!.vp, ctx.drawCamPos)),
    new Float32Array(FRUSTUM_FLOATS_PER_VIEW),
  );
  return everyFrustumInsideACone(planes, cones);
}
