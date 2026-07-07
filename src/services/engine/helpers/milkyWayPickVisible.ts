/**
 * milkyWayPickVisible — is the Milky-Way disk on screen in the frame the
 * pick pass replays?
 *
 * The MW pick billboard must contribute a hit ONLY while the disk is
 * actually drawn, so a faded-out MW never claims a click.  The predicate
 * itself lives in `milkyWayVisible` — the ONE home shared with
 * `milkyWayPass.enabled`, so the pick gate can't drift from the draw gate.
 * This adapter's whole job is choosing the CAMERA the predicate answers
 * for:
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
 * Threaded into the pick renderer as a callback so the renderer itself
 * stays free of EngineState — it just draws when told.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { milkyWayVisible } from './milkyWayVisible';

export function milkyWayPickVisible(state: EngineState, viewportHeightPx: number): boolean {
  const cam = state.picking.lastFrameCam;
  if (!cam) return false;
  // Event-time now: picks fire on pointer events, outside the frame loop,
  // so the wall clock IS this path's clock (the deterministic ctx.nowMs
  // seam only exists inside a frame).
  return milkyWayVisible(state, cam.position, cam.fovYRad, viewportHeightPx, performance.now());
}
