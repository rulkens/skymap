/**
 * deriveBodyStates — derive every scene body's time-varying `BodyState`
 * (position, orientation, orbital phase) from the one Keplerian element table,
 * keyed by id. The clock-driven half of the bodies, computed instead of baked.
 *
 * ### Why a derive, not baked records
 *
 * The scene bodies used to bake their position + orientation at module load
 * (`SCENE_PLANETS`, `SCENE_EARTH`), freezing the system at J2000 — the only
 * position a body could have was the one computed once, at import. This derive
 * lifts that mutable half out so a clock can move it: given a sim instant it
 * recomputes each body's state from `ORBITAL_ELEMENTS` (the single source of
 * truth both the bodies and their orbit trails already read), exactly the way
 * `heliocentricPlanet` / `satelliteBody` compute it today — same
 * `keplerianPositionMpc` evaluation, same render-origin anchor, same
 * `orientationForBody` gate. `deriveBodyStates(CONST_J2000)` therefore
 * reproduces the current baked values bit-for-bit (the prep zero-change proof):
 * at the epoch `propagateElements` is the identity map, so the propagated
 * elements equal the tabulated ones.
 *
 * ### `simDays` drives both orientation and position
 *
 * The sim-day scalar advances each body along its orbit AND turns it on its
 * axis. Position comes from `keplerianPositionMpc(propagateElements(el,
 * simDays))` — the element table's per-Julian-century rates carry mean anomaly
 * (and the slowly precessing node/apsis) forward to `t` — and orientation from
 * `orientationForBody`. At `CONST_J2000`, zero centuries have elapsed, so
 * propagation leaves the elements untouched and the derived state matches the
 * baked J2000 values; later instants move the body along its ellipse and spin
 * it. `meanAnomalyRad` on the state is the PROPAGATED `M` (the value at `t`, not
 * epoch), because it is the orbit-trail falloff anchor — a trail that fades
 * behind the body must anchor on where the body actually is.
 *
 * ### One instant per frame, memoized
 *
 * A frame reads this snapshot from several passes (draw, pick, labels), so all
 * of them must see the SAME instant — recomputing per reader would let a
 * mid-frame clock tick tear the draw pass from the pick pass. The result is
 * memoized on `simDays`: an unchanged `simDays` (a paused clock, or the repeated
 * reads within one frame) returns the cached Map by reference at no cost, and
 * only a new instant pays for the ~22 Kepler solves. The cache is one deep — the
 * clock advances monotonically, so the last instant is the only one a frame ever
 * re-reads.
 *
 * ### Planets first, then moons — one focus hop
 *
 * A heliocentric body's focus is the render origin (the Sun); a moon's focus is
 * its parent planet's already-derived world position. So the derive runs in two
 * passes: all `focusId: 'sun'` bodies first (their state depends on nothing
 * else), then everything else, each resolving its focus from the map built in
 * pass one and adding its own offset. Every moon's focus is itself heliocentric
 * — there is no moon-of-a-moon — so one hop suffices, matching
 * `satelliteBody`'s parent-offset resolution. The `'sun'` id is still
 * special-cased below rather than resolved through a map, because this derive
 * does not yet seed the Sun as an anchor — that lands once `SCENE_ANCHORS`
 * joins the seam.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import { ORBITAL_ELEMENTS } from '../../../data/bodies/orbitalElements';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { propagateElements } from '../../../utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../../utils/math/addVec3';

// The last computed snapshot, keyed by the instant it was computed at. A frame
// re-reads the same instant from several passes and a paused clock re-reads it
// every frame, so a one-deep cache makes both free; a new instant recomputes.
let cachedSimDays: number | undefined;
let cachedStates: ReadonlyMap<string, BodyState> | undefined;

export function deriveBodyStates(simDays: number): ReadonlyMap<string, BodyState> {
  if (cachedStates !== undefined && simDays === cachedSimDays) {
    return cachedStates;
  }

  const states = new Map<string, BodyState>();

  // Pass one — heliocentric bodies (planets + the EMB), `focusId === 'sun'`.
  // Focus is the render origin, so the position is origin + the propagated
  // element offset — the same composition `heliocentricPlanet` performs,
  // evaluated at `simDays`.
  for (const el of ORBITAL_ELEMENTS) {
    if (el.focusId !== 'sun') continue;
    const propagated = propagateElements(el, simDays);
    states.set(el.id, {
      positionMpc: addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(propagated)),
      orientation: orientationForBody(el.id, simDays),
      meanAnomalyRad: propagated.meanAnomalyRad,
    });
  }

  // Pass two — moons. Focus is the parent's already-derived SNAPSHOT position
  // (one hop; every parent is heliocentric, resolved in pass one), plus the
  // moon's own propagated offset — the same composition `satelliteBody`
  // performs. Reading the parent from the snapshot, not re-deriving it, is what
  // welds a moon to the exact parent instant every reader of this map sees.
  for (const el of ORBITAL_ELEMENTS) {
    if (el.focusId === 'sun') continue;
    const parent = states.get(el.focusId);
    if (parent === undefined) {
      throw new Error(`deriveBodyStates: moon '${el.id}' names unknown focus '${el.focusId}'`);
    }
    const propagated = propagateElements(el, simDays);
    states.set(el.id, {
      positionMpc: addVec3(parent.positionMpc, keplerianPositionMpc(propagated)),
      orientation: orientationForBody(el.id, simDays),
      meanAnomalyRad: propagated.meanAnomalyRad,
    });
  }

  cachedSimDays = simDays;
  cachedStates = states;
  return states;
}
