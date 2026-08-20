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

export function deriveMilkyWayCloudAlpha(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
  if (!milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height, ctx.nowMs)) {
    return null;
  }

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  // Near-side approach fade, orthogonal to the far-side band above: shuts only
  // deep inside the disc, once the Gaia star catalog has taken over.
  const approach = fadeBand(SCALE_FADE_BANDS.milkyWayApproach, camDistMpc);
  if (approach <= 0) return null;

  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, ctx.canvasSize.height) *
    approach *
    resolveLayerOpacity(state, ctx, { kind: 'milkyWay' });

  return alpha > 0 ? alpha : null;
}
