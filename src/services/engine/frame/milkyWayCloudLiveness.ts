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
import { regionRelativeDistanceMpc } from '../../../utils/scene/regionRelativeDistanceMpc';
import { regionById } from '../../../utils/scene/regionById';

const GALACTIC_CENTRE_REGION = regionById('galactic-centre');

export function deriveMilkyWayCloudAlpha(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
  if (!milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height, ctx.nowMs)) {
    return null;
  }

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  // Two independent near-side approach fades, combined by MIN: the Sun's own
  // descent (`milkyWayApproach`, keyed on the origin — the Sun sits there —
  // must still reach 0, the hand-off to the real Gaia star catalog) and the
  // galactic centre's (`milkyWayApproachGc`, keyed on distance from Sgr A*,
  // whose `floor` keeps it dimly visible instead of vanishing).
  const bodyStates = sceneBodyStates(state, ctx);
  const sunApproach = fadeBand(SCALE_FADE_BANDS.milkyWayApproach, camDistMpc);
  const gcDistMpc = regionRelativeDistanceMpc(ctx.drawCamPos, GALACTIC_CENTRE_REGION, bodyStates);
  const gcApproach = fadeBand(SCALE_FADE_BANDS.milkyWayApproachGc, gcDistMpc);
  const approach = Math.min(sunApproach, gcApproach);
  if (approach <= 0) return null;

  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, ctx.canvasSize.height) *
    approach *
    resolveLayerOpacity(state, ctx, { kind: 'milkyWay' });

  return alpha > 0 ? alpha : null;
}
