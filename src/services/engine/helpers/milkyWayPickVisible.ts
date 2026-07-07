/**
 * milkyWayPickVisible — is the Milky-Way disk on screen this frame?
 *
 * The MW pick billboard must contribute a hit ONLY while the disk is
 * actually drawn, so a faded-out MW never claims a click.  This predicate
 * mirrors `milkyWayPass.enabled` beat-for-beat — the right invariant is
 * "pickable iff the disk is rendered", so the pick gate and the draw gate
 * read the same two conditions:
 *
 *   1. The user toggle (or its fade-out tail): `settings.milkyWay.enabled`
 *      OR `opacityOf({ kind: 'milkyWay' }) > 0`.
 *   2. The apparent-size fade band: `milkyWayFadeAlpha(camDist, fovY,
 *      viewportH) > 0` (full strength while the disc spans at least
 *      `MILKY_WAY_FADE_FULL_PX` on screen, gone at
 *      `MILKY_WAY_FADE_GONE_PX`).
 *
 * The camera facts come from `state.picking.lastFrameCam` — the snapshot
 * the point-sprites pass stashes alongside `lastFrameUniformBytes` — NOT
 * from the `state.cam` drag register.  The pick pass renders against the
 * last visual frame's camera, so the gate must agree with THAT frame; the
 * drag register only re-seeds when a drag starts and lags every
 * driver-driven move (wheel zoom, tweens), which would leave the gate
 * answering for a stale pose.  Null snapshot (no visual frame yet) means
 * nothing has been rendered to pick against — not visible.
 *
 * `viewportHeightPx` is the backing-store canvas height (texture pixels) —
 * the same measure the pick pass renders against and `milkyWayPass` reads
 * off `ctx.canvasSize`.
 *
 * Keeping this in a helper (rather than inlining the predicate at every
 * pick call site) means the pick gate can't drift from the pass's
 * `enabled` check.  Threaded into the pick renderer as a callback so the
 * renderer itself stays free of EngineState — it just draws when told.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { milkyWayFadeAlpha } from '../../gpu/galaxy/milkyWayFadeAlpha';

export function milkyWayPickVisible(state: EngineState, viewportHeightPx: number): boolean {
  const cam = state.picking.lastFrameCam;
  if (!cam) return false;
  const togglePart =
    state.settings.milkyWay.enabled ||
    state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now()) > 0;
  if (!togglePart) return false;
  const p = cam.position;
  const camDistMpc = Math.hypot(p[0]!, p[1]!, p[2]!);
  return milkyWayFadeAlpha(camDistMpc, cam.fovYRad, viewportHeightPx) > 0;
}
