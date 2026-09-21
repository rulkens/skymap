import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { StarCutFrustum } from '../../../../../@types/rendering/StarCutFrustum';
import { NEAR0 } from '../../../../engine/frame/slabs';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { buildStarCutFrustum } from '../../../../../utils/star/buildStarCutFrustum';

/**
 * The off-screen prune frustum a star-octree walk clips against, shared by the
 * fade advance and the capture-face walk: one plane set per view, each rebased
 * about the CUT's origin rather than the view's own eye, so every view prunes in
 * the frame the walk's boxes live in. `null` when any view has no resolvable
 * NEAR0 slab (a hand-built test context) — then nothing is pruned at all.
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
