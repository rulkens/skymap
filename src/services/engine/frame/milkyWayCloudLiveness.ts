/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud
 * live this frame, and at what opacity?", shared by the three layers of its
 * producer/consumer chain: `milkyWayAggregateLayer` (star billboards into the
 * reduced-res `mw-aggregate` offscreen), `milkyWayUpsampleLayer` (composites
 * that into HDR), and `milkyWayLayer` (dust pass, full-res in HDR, plus pick).
 * If those three could answer visibility differently, the upsample could
 * composite an offscreen nobody wrote this frame — the same stale-offscreen
 * trap `volumeLiveness.ts` closes for volumes and `starCatalogVisible` closes
 * for the star pass's identical split.
 *
 * Composites three factors on top of `milkyWayVisible` (the far-side toggle +
 * apparent-size predicate): `milkyWayFadeAlpha` as a continuous ramp rather
 * than the boolean `milkyWayVisible` reduces it to, the near-side
 * `milkyWayApproach` fade band (closes at kpc range once Gaia takes over),
 * and the registry toggle opacity (so the layer survives its fade-out tail).
 * Returns `null` rather than 0 for "not live" so callers can gate on
 * `!== null` without risking `if (alpha)` on a legitimately-zero value.
 *
 * Uses the CANVAS height, not the slab view's viewport: the apparent-size
 * band is a canvas-relative fact, but the aggregate layer renders into a
 * fraction of the canvas, so its `view.viewportPx` would give the three
 * gates different answers where they must agree.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { milkyWayVisible } from '../helpers/milkyWayVisible';
import { milkyWayFadeAlpha } from '../galaxyGenerator/v1/milkyWayFadeAlpha';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../presentation/scaleFadeBands';

/**
 * The cloud's composited draw opacity this frame, or `null` when it should not
 * draw at all (so the executor skips the pass entirely — no `beginRenderPass`,
 * no tile-RAM round trip, no idle timestamp slot).
 */
export function deriveMilkyWayCloudAlpha(
  state: EngineState,
  ctx: ReadyFrameContext,
): number | null {
  // The shared far-side/toggle predicate, answered for THIS frame's camera and
  // clock — the frame-frozen ctx snapshot (ctx.nowMs is the deterministic time
  // seam; layers never read the wall clock directly).
  if (!milkyWayVisible(state, ctx.drawCamPos, ctx.fovYRad, ctx.canvasSize.height, ctx.nowMs)) {
    return null;
  }

  const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
  // Near-side approach fade: shuts only deep inside the disc, once the Gaia
  // star catalog has fully taken over. Orthogonal to the far-side band above.
  const approach = fadeBand(SCALE_FADE_BANDS.milkyWayApproach, camDistMpc);
  if (approach <= 0) return null;

  const alpha =
    milkyWayFadeAlpha(camDistMpc, ctx.fovYRad, ctx.canvasSize.height) *
    approach *
    state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, ctx.nowMs);

  return alpha > 0 ? alpha : null;
}
