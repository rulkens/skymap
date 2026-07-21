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
 * reproduces the current baked values bit-for-bit (the prep zero-change proof).
 *
 * ### `simDays` is the seam, unread at prep
 *
 * The signature takes a sim-day scalar because the feature (§3) fills it with
 * rate propagation — advancing each body's mean anomaly from the epoch. At prep
 * there is no propagation: every body is evaluated at its tabulated J2000 mean
 * elements regardless of `simDays`, so the parameter is deliberately unread here.
 * It exists now so consumers can be repointed onto the final signature and the
 * later task only has to fill the body, not thread a new argument through ~10
 * call sites.
 *
 * ### Planets first, then moons — one parent hop
 *
 * A heliocentric body's focus is the render origin (the Sun); a moon's focus is
 * its parent planet's already-derived world position. So the derive runs in two
 * passes: all `parentId: null` bodies first (their state depends on nothing
 * else), then all moons, each resolving its parent from the map built in pass
 * one and adding its own offset. Every moon parent is itself heliocentric —
 * there is no moon-of-a-moon — so one hop suffices, matching
 * `satelliteBody`'s parent-offset resolution.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import { ORBITAL_ELEMENTS } from '../../../data/bodies/orbitalElements';
import { orientationForBody } from '../../../data/bodies/orientationForBody';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { keplerianPositionMpc } from '../../../utils/orbit/keplerianPositionMpc';
import { addVec3 } from '../../../utils/math/addVec3';

// `simDays` is the prep seam: rate propagation (§3) will read it to advance each
// body's mean anomaly from the epoch. The rate-less derive evaluates the
// tabulated J2000 mean elements regardless, so the parameter is intentionally
// unread here — it exists now so consumers bind to the final signature.
export function deriveBodyStates(simDays: number): ReadonlyMap<string, BodyState> {
  const states = new Map<string, BodyState>();

  // Pass one — heliocentric bodies (planets + the EMB). Focus is the render
  // origin, so the position is origin + the element table's offset, exactly as
  // `heliocentricPlanet` bakes it.
  for (const el of ORBITAL_ELEMENTS) {
    if (el.parentId !== null) continue;
    states.set(el.id, {
      positionMpc: addVec3(RENDER_ORIGIN_MPC, keplerianPositionMpc(el)),
      orientation: orientationForBody(el.id),
      meanAnomalyRad: el.meanAnomalyRad,
    });
  }

  // Pass two — moons. Focus is the parent's already-derived world position
  // (one hop; every parent is heliocentric, resolved in pass one), plus the
  // moon's own offset — the same composition `satelliteBody` performs, and
  // value-identical because addVec3 folds origin + parentOffset + moonOffset in
  // the same order either way.
  for (const el of ORBITAL_ELEMENTS) {
    if (el.parentId === null) continue;
    const parent = states.get(el.parentId);
    if (parent === undefined) {
      throw new Error(
        `deriveBodyStates: moon '${el.id}' names unknown parent '${el.parentId}'`,
      );
    }
    states.set(el.id, {
      positionMpc: addVec3(parent.positionMpc, keplerianPositionMpc(el)),
      orientation: orientationForBody(el.id),
      meanAnomalyRad: el.meanAnomalyRad,
    });
  }

  return states;
}
