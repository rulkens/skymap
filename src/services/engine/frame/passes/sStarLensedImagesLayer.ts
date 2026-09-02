/**
 * sStarLensedImagesLayer — the S-stars as Sgr A* images them, drawn ON TOP of
 * the lens pass instead of through its sky cubemap.
 *
 * The cubemap is an at-infinity capture from a pinned eye — right for the
 * survey, wrong for sources this close (finite-distance Einstein radius, live
 * parallax) — so `starPointsLayer` stands its S-stars down inside the band and
 * this row draws `sStarLensedImages`. Its OWN `StarPointRenderer`: `setStars`
 * is a `writeBuffer` whose LAST write wins the submit (docs/RENDERER.md).
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { PositionedStar } from '../../../../@types/scene/PositionedStar';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from '../partitionStarsByResolution';
import { positionedVisibleStars } from '../positionedVisibleStars';
import { sceneBodyStates } from '../sceneBodyStates';
import { sgrAStarLensBandAlpha } from '../sgrAStarLensBandAlpha';
import { sStarLensedImages } from '../sStarLensedImages';
import { starPointDrawParams } from '../starPointDrawParams';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { SGR_A_STAR } from '../../../../data/bodies/sceneSgrAStar';
import { SGR_A_STAR_SCHWARZSCHILD_RADIUS_MPC } from '../../../../data/bodies/sgrAStarSchwarzschildRadiusMpc';

/**
 * This frame's images, camera-relative. Fed the SAME `points` branch
 * `starPointsLayer` drops its S-stars from, so the two rows partition the
 * roster between them rather than each deciding independently.
 */
function lensedImages(
  state: EngineState,
  ctx: ReadyFrameContext,
  camPosMpc: Readonly<Vec3>,
  viewportHeightPx: number,
): readonly PositionedStar[] {
  const { points } = partitionStarsByResolution({
    stars: positionedVisibleStars(state, ctx),
    camPosMpc,
    thresholdPx: STAR_RESOLVE_PX,
    viewportHeightPx,
    fovYRad: ctx.fovYRad,
  });
  return sStarLensedImages({
    stars: points,
    camPosMpc,
    lensPosMpc: sceneBodyStates(state, ctx).get(SGR_A_STAR.id)!.positionMpc,
    schwarzschildRadiusMpc: SGR_A_STAR_SCHWARZSCHILD_RADIUS_MPC,
  });
}

export const sStarLensedImagesLayer: ContentLayer = {
  name: 's-star-lensed-images',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',
  // The point of the row: the lens pass blends OVER, so an image drawn in the
  // 'pre' half would be wiped by the very disc it belongs in front of.
  hdrPostLensing: true,

  enabled(state, ctx, _view) {
    // Handle first (short-circuits before any ctx / state.data read, matching
    // its sibling rows), band second — outside it this layer has no subject at
    // all — the per-star lens solve last.
    if (state.gpu.sStarLensedImageRenderer === null) return false;
    if (sgrAStarLensBandAlpha(state, ctx) <= 0) return false;
    return lensedImages(state, ctx, ctx.drawCamPos, ctx.canvasSize.height).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.sStarLensedImageRenderer;
    if (renderer === null) return;

    const camPos = view.camPos;
    // Already camera-relative out of `sStarLensedImages` — the f64 seam
    // `starPointsLayer` builds by subtraction, here free: an image direction is
    // camera-relative by construction.
    const images = lensedImages(state, ctx, camPos, view.viewportPx[1]);
    const { sizePx, brightness, backdropFade } = starPointDrawParams(state, ctx, camPos);

    renderer.setStars(
      images.map((image) => ({
        ...image,
        color: [
          image.color[0] * backdropFade,
          image.color[1] * backdropFade,
          image.color[2] * backdropFade,
        ] as Vec3,
      })),
      ctx.viewSlot,
    );
    renderer.draw(pass, narrowMat4(rebaseViewProj(view.slab.vp, camPos)), view.viewportPx, {
      sizePx,
      brightness,
      viewSlot: ctx.viewSlot,
    });
  },
};
