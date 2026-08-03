/**
 * milkyWayCloudLiveness — the ONE derivation of "is the Milky Way point cloud
 * live this frame, and at what opacity?", shared by the three layers that make
 * up the cloud's draw.
 *
 * ### Why a shared projection rather than three `enabled` gates
 *
 * The cloud is now a producer/consumer chain across two render targets:
 *
 *   - `milkyWayAggregateLayer` draws the star billboards into the
 *     reduced-resolution `mw-aggregate` offscreen,
 *   - `milkyWayUpsampleLayer` composites that offscreen into HDR,
 *   - `milkyWayLayer` draws the dust pass full-res into HDR (and carries the
 *     pick aspect).
 *
 * If those three could answer the visibility question differently, the
 * upsample could composite an offscreen nobody wrote this frame — the
 * stale-offscreen trap the volume liveness projection (`volumeLiveness.ts`)
 * exists to close, and which `starCatalogVisible` closes for the star pass's
 * identical three-layer split. One derivation, three delegating gates.
 *
 * ### The three fade factors, composited here
 *
 * `milkyWayVisible` is the shared far-side predicate — the user toggle (or a
 * still-nonzero toggle fade-out tail) AND the apparent-size band. On top of it
 * this projection multiplies:
 *
 *   1. `milkyWayFadeAlpha` — the far-side apparent-size ramp itself, as a
 *      continuous value rather than the boolean `milkyWayVisible` reduces it to.
 *   2. `fadeBand(SCALE_FADE_BANDS.milkyWayApproach, …)` — the near-side approach
 *      fade, the only gate that closes at kpc range, where the Gaia star catalog
 *      has taken over.
 *   3. The registry toggle opacity, so the layer survives its ~100 ms fade-out.
 *
 * Returning `null` (rather than 0) for "not live" keeps the gate a
 * `!== null` check at each call site and makes an accidental `if (alpha)`
 * on a legitimately-zero alpha impossible to write.
 *
 * ### Why the CANVAS height, not the slab view's viewport
 *
 * The apparent-size band asks how big the disc looks TO THE USER, which is a
 * canvas-relative fact. The aggregate layer renders into a target that is a
 * fraction of the canvas, so its `view.viewportPx` would give a different (and
 * wrong) answer than the two HDR layers — the three gates would disagree
 * exactly where they must not. `ctx.canvasSize.height` is the same number for
 * all three by construction.
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
