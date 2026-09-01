/**
 * milkyWayVisible — is the Milky Way point cloud drawn for a given camera?
 * THE single home of the MW visibility predicate. Two gates: the user toggle
 * (or its fade-out tail: `settings.milkyWay.enabled` OR
 * `fades.opacityOf({kind:'milkyWay'}) > 0`, so the cloud stays alive and
 * pickable through the ~100 ms toggle ramp), AND the apparent-size fade band
 * (`milkyWayFadeAlpha(camDist, fovY, viewportH) > 0`).
 *
 * The camera and clock come in as parameters rather than read off state
 * because the draw and pick programs evaluate this SAME gate against
 * DIFFERENT cameras — draw passes the frame-frozen `ctx.drawCamPos` /
 * `ctx.fovYRad` / `ctx.nowMs`, pick passes its own pick-time replay. Sharing
 * one gate (not a mirrored pair) means the pick answer can't drift from the
 * draw answer for that camera; reading the live pose instead would
 * lag a wheel-zoom/tween between frames and let a vanished disc claim a
 * click, or a visible one miss.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec3 } from '../../../@types/math/Vec3';
import { milkyWayFadeAlpha } from '../galaxyGenerator/v1/milkyWayFadeAlpha';

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
