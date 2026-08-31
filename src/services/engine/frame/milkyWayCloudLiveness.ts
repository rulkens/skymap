/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud live
 * this frame, and at what opacity?", shared by the aggregate producer, the upsample
 * consumer and the dust pass, so the upsample can never composite an offscreen
 * nobody wrote. The fade-out tail is held open by `milkyWayVisible`'s RAW toggle
 * read, not by this product.
 *
 * Uses the CANVAS height, not the slab view's viewport: the aggregate layer renders
 * into a FRACTION of the canvas, so `view.viewportPx` would split the three gates.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { milkyWayVisible } from '../helpers/milkyWayVisible';
import { milkyWayFadeAlpha } from '../galaxyGenerator/v1/milkyWayFadeAlpha';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';
import { resolveLayerOpacity } from '../presentation/focusRecession';
import { sceneBodyStates } from './sceneBodyStates';
import { nearestRegionAnchorDistanceMpc } from '../../../utils/scene/nearestRegionAnchorDistanceMpc';

export function deriveMilkyWayCloudAlpha(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
  if (!milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height, ctx.nowMs)) {
    return null;
  }

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  // Near-side approach fade: shuts only deep inside the disc, once the Gaia star
  // catalog has taken over — keyed on the NEAREST region anchor, not the origin,
  // so the fade also closes descending on Sgr A* (8.2 kpc from the Sun, which
  // origin-hypot alone would read as still "far").
  const approachDistMpc = nearestRegionAnchorDistanceMpc(
    ctx.drawCamPos,
    sceneBodyStates(state, ctx),
  );
  const approach = fadeBand(SCALE_FADE_BANDS.milkyWayApproach, approachDistMpc);
  if (approach <= 0) return null;

  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, ctx.canvasSize.height) *
    approach *
    resolveLayerOpacity(state, ctx, { kind: 'milkyWay' });

  return alpha > 0 ? alpha : null;
}
