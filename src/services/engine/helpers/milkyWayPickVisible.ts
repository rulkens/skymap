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
 * `viewportHeightPx` is the backing-store canvas height (texture pixels) —
 * the same measure the pick pass renders against and `milkyWayPass` reads
 * off `ctx.canvasSize`.  The vertical fov comes off `state.cam`, which this
 * predicate already requires, so the callers only thread the one value
 * they hold anyway (their canvas).
 *
 * Keeping this in a helper (rather than inlining the predicate at every
 * pick call site) means the pick gate can't drift from the pass's
 * `enabled` check.  Threaded into the pick renderer as a callback so the
 * renderer itself stays free of EngineState — it just draws when told.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { milkyWayFadeAlpha } from '../../gpu/galaxy/milkyWayFadeAlpha';

export function milkyWayPickVisible(state: EngineState, viewportHeightPx: number): boolean {
  if (!state.cam) return false;
  const togglePart =
    state.settings.milkyWay.enabled ||
    state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now()) > 0;
  if (!togglePart) return false;
  const p = state.cam.position;
  const camDistMpc = Math.hypot(p[0]!, p[1]!, p[2]!);
  return milkyWayFadeAlpha(camDistMpc, state.cam.fovYRad, viewportHeightPx) > 0;
}
