import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCutFrustum } from '../../@types/StarCutFrustum';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { buildStarCutFrustum } from '../../../../utils/star/buildStarCutFrustum';

/**
 * The off-screen prune frustum a star-octree walk clips against, shared by the
 * fade advance and the capture-face walk: one plane set per view, rebased about
 * the CUT's origin — in f64, narrowed only after, the cancellation discipline
 * `computeStarCut` keeps for node origins — so every view prunes in the frame
 * the walk's boxes live in. No NEAR0 slab (a test ctx) ⇒ `null`, no prune.
 */
export function frameStarCutFrustum(
  views: readonly FrameView[],
  camPos: Readonly<Vec3>,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null {
  const rebasedVps: Float32Array[] = [];
  // The widest view drives the angular slack (see `buildStarCutFrustum`): the
  // SMALLEST `drawPxPerRad` — fewer pixels per radian means more radians per
  // pixel, so that view needs the most slack.
  let pxPerRad = Infinity;
  if (views.every((view) => view.slabs?.[NEAR0] !== undefined)) {
    for (const view of views) {
      rebasedVps.push(narrowMat4(rebaseViewProj(view.slabs[NEAR0]!.vp, camPos)));
      if (view.drawPxPerRad < pxPerRad) pxPerRad = view.drawPxPerRad;
    }
  }
  return buildStarCutFrustum(rebasedVps, pxPerRad, sizePx, glowOverlap);
}
