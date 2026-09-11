/**
 * deriveBodyStates — derives every scene body's time-varying `BodyState`
 * from the anchor table and the Keplerian element table, keyed by id.
 * `meanAnomalyRad` is the PROPAGATED `M` at `t` (not epoch) — the
 * orbit-trail falloff anchor, so a trail fading behind the body must
 * track where it actually is. Memoized on `simDays`: every pass (draw,
 * pick, labels) reads the same snapshot each frame, so recomputing per
 * reader would tear a mid-frame clock tick between passes.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { Vec3 } from '../../../@types/math/Vec3';
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

  // Phase 1 — positions only, so phase 2 can orient a body against where the
  // *other* bodies ended up rather than against iteration order.
  const positions = new Map<string, Vec3>();
  const meanAnomalies = new Map<string, number>();

  // 1a — the roots: position authored, not orbited, and M = 0: an anchor has
  // no orbit for a trail to fade along. The authored position is shared by
  // reference rather than copied: it is never mutated, and a copy would
  // allocate per instant for nothing.
  for (const anchor of SCENE_ANCHORS) {
    positions.set(anchor.id, anchor.positionMpc);
    meanAnomalies.set(anchor.id, 0);
  }

  // 1b — every element row, focus before dependant. The focus is already in
  // the map by construction of `FOCUS_ORDER`, which is also where an unknown
  // focus id throws — so the lookup here is total.
  for (const el of FOCUS_ORDER) {
    const focus = positions.get(el.focusId)!;
    const propagated = propagateElements(el, simDays);
    positions.set(el.id, addVec3(focus, keplerianPositionMpc(propagated)));
    meanAnomalies.set(el.id, propagated.meanAnomalyRad);
  }

  // Phase 2 — orientations over the finished position map. Anchors go through
  // `orientationForBody` too, so the rotation-row gate stays one gate.
  const states = new Map<string, BodyState>();
  for (const [id, positionMpc] of positions) {
    states.set(id, {
      positionMpc,
      orientation: orientationForBody(id, simDays, positions),
      meanAnomalyRad: meanAnomalies.get(id)!,
    });
  }

  cachedSimDays = simDays;
  cachedStates = states;
  return states;
}
