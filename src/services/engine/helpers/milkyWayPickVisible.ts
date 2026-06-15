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
 *   2. The camera-distance fade band: `milkyWayFadeAlpha(camDist) > 0`
 *      (full strength inside 10 Mpc, smoothstep out to 0 at 50 Mpc).
 *
 * Keeping this in a helper (rather than inlining the predicate at every
 * pick call site) means the pick gate can't drift from the pass's
 * `enabled` check.  Threaded into the pick renderer as a callback so the
 * renderer itself stays free of EngineState — it just draws when told.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { milkyWayFadeAlpha } from '../../../utils/math/milkyWayFadeAlpha';

export function milkyWayPickVisible(state: EngineState): boolean {
  if (!state.cam) return false;
  const togglePart =
    state.settings.milkyWay.enabled ||
    state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now()) > 0;
  if (!togglePart) return false;
  const p = state.cam.position;
  const camDistMpc = Math.hypot(p[0]!, p[1]!, p[2]!);
  return milkyWayFadeAlpha(camDistMpc) > 0;
}
