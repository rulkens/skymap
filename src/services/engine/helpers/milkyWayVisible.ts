/**
 * milkyWayVisible — THE single home of the MW visibility predicate: the user
 * toggle OR its fade-out tail (so the cloud stays pickable through the ~100 ms
 * ramp), AND the apparent-size fade band. Camera and clock arrive as parameters
 * because draw and pick evaluate this same gate against DIFFERENT cameras;
 * reading the live pose instead would lag a wheel-zoom between frames and let a
 * vanished disc claim a click.
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
