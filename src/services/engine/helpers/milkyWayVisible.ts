/**
 * milkyWayVisible — is the Milky Way point cloud drawn for a given camera?
 *
 * THE single home of the MW visibility predicate.  Two gates:
 *
 *   1. The user toggle (or its fade-out tail): `settings.milkyWay.enabled`
 *      OR `fades.opacityOf({ kind: 'milkyWay' }) > 0` — the fade keeps
 *      the cloud alive (and pickable) through the ~100 ms toggle ramp.
 *   2. The apparent-size fade band: `milkyWayFadeAlpha(camDist, fovY,
 *      viewportH) > 0` (full strength while the disc spans at least
 *      `MILKY_WAY_FADE_FULL_PX` on screen, gone at
 *      `MILKY_WAY_FADE_GONE_PX`).
 *
 * ## Why the camera comes in as parameters
 *
 * The two callers answer the question for DIFFERENT frames, so the camera
 * facts are injected rather than read off state here:
 *
 * - `milkyWayPass.enabled` asks about the frame being rendered NOW and
 *   passes the frame-frozen `ctx.drawCamPos` / `ctx.fovYRad`.
 * - `milkyWayPickVisible` asks about the frame the pick pass REPLAYS and
 *   passes `state.picking.lastFrameCam` — the snapshot stashed alongside
 *   the replayed uniform bytes.  The pick gate must agree with THAT
 *   frame, not the live camera, or a wheel-zoom/tween between frames
 *   would let a vanished disc claim a click (or a visible one miss).
 *
 * Both callers hand over the camera POSITION; the origin-distance hypot
 * lives here so neither re-derives it.  `viewportHeightPx` is the
 * backing-store canvas height (texture pixels) in both cases.
 *
 * `nowMs` is injected for the same reason the camera is: the render pass
 * runs on the deterministic frame clock (`ctx.nowMs` — passes never read
 * the wall clock), while the pick path fires on pointer events and hands
 * in its own event-time now.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec3 } from '../../../@types/math/Vec3';
import { milkyWayFadeAlpha } from '../../gpu/galaxy/milkyWayFadeAlpha';

export function milkyWayVisible(
  state: EngineState,
  camPos: Readonly<Vec3>,
  fovYRad: number,
  viewportHeightPx: number,
  nowMs: number,
): boolean {
  const togglePart =
    state.settings.milkyWay.enabled ||
    state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, nowMs) > 0;
  if (!togglePart) return false;
  const camDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
  return milkyWayFadeAlpha(camDistMpc, fovYRad, viewportHeightPx) > 0;
}
