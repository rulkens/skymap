/**
 * deriveBodyStates — derive every scene body's time-varying `BodyState`
 * (position, orientation, orbital phase) from the anchor table and the one
 * Keplerian element table, keyed by id. The clock-driven half of the bodies,
 * computed instead of baked.
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
 * `keplerianPositionMpc` evaluation, same focus composition, same
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
 * ### Anchors first, then rows in focus order
 *
 * `SCENE_ANCHORS` seeds the map with the bodies whose position is authored
 * rather than orbited. Every element row then reads its focus back out of that
 * same map and adds its own propagated offset — the composition
 * `heliocentricPlanet` / `satelliteBody` perform — walking the order
 * `focusResolveOrder` computes from the authored graph, so a focus chain of any
 * depth resolves. Taking the focus from the snapshot rather than re-deriving it
 * is what welds a body to the exact focus instant every reader of this map sees.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import { ORBITAL_ELEMENTS } from '../../../data/bodies/orbitalElements';
import { SCENE_ANCHORS } from '../../../data/bodies/sceneAnchors';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { propagateElements } from '../../../utils/orbit/propagateElements';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { focusResolveOrder } from '../../../utils/scene/focusResolveOrder';
import { addVec3 } from '../../../utils/math/addVec3';

// The focus graph is authored, static data, so its order is resolved once at
// module load and replayed every instant: the per-frame cost stays one linear
// pass, and a cycle or a dangling focus fails at import — where an authoring
// mistake belongs — instead of on whichever frame first reaches the bad row.
const FOCUS_ORDER = focusResolveOrder(SCENE_ANCHORS, ORBITAL_ELEMENTS);

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

  // The roots: position authored, not orbited. They still go through
  // `orientationForBody` so the texture-keyed facing gate stays one gate for
  // every body, and carry M = 0 — an anchor has no orbit for a trail to fade
  // along. The authored position is shared by reference rather than copied: it
  // is never mutated, and a copy would allocate per instant for nothing.
  for (const anchor of SCENE_ANCHORS) {
    states.set(anchor.id, {
      positionMpc: anchor.positionMpc,
      orientation: orientationForBody(anchor.id, simDays),
      meanAnomalyRad: 0,
    });
  }

  // Every element row, focus before dependant. The focus is already in the map
  // by construction of `FOCUS_ORDER`, which is also where an unknown focus id
  // throws — so the lookup here is total.
  for (const el of FOCUS_ORDER) {
    const focus = states.get(el.focusId)!;
    const propagated = propagateElements(el, simDays);
    states.set(el.id, {
      positionMpc: addVec3(focus.positionMpc, keplerianPositionMpc(propagated)),
      orientation: orientationForBody(el.id, simDays),
      meanAnomalyRad: propagated.meanAnomalyRad,
    });
  }

  cachedSimDays = simDays;
  cachedStates = states;
  return states;
}
