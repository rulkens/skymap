/**
 * sceneBodyStates — resolve THE per-frame map of every scene body's
 * time-varying `BodyState` (position, orientation, orbital phase) from live
 * engine state, keyed by id. The per-frame binding of `deriveBodyStates`.
 *
 * ### The sole epoch-choice site
 *
 * `deriveBodyStates(simDays)` is pure over a sim-day scalar; this thin adapter
 * is the ONE place the scene chooses which instant to evaluate. It binds the
 * epoch to `CONST_J2000` — the J2000.0 "now" the static scene has always shown
 * — so every per-frame consumer (the planets, textured-bodies, and orbit-trail
 * layers repointed in A3–A6) reads one map, derived once, at one agreed epoch.
 *
 * Per-frame consumers must therefore never call `deriveBodyStates(...)`
 * directly with an epoch of their own: if two layers each picked an instant
 * they could drift apart and draw the same body at two positions. The epoch
 * lives here and only here. The feature (02-core) advances the clock by
 * swapping the `CONST_J2000` argument below for the frame's derived `simDays`
 * — a one-line change at this single seam, with no consumer touched.
 *
 * ### `state` / `ctx` unread at prep
 *
 * The signature mirrors its peer `sceneBodyPartition` (takes `state`, `ctx`;
 * returns the map) so all per-frame body binders share one shape. Neither is
 * read yet: the rate-less prep derive evaluates the tabulated J2000 elements
 * regardless of any clock, and the clock 02-core will read (`ctx.simDays`)
 * arrives through `ctx` — so the parameters exist now for consumers to bind to
 * the final signature, unread until the epoch swap fills them in.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { BodyState } from '../../../@types/scene/BodyState';
import { CONST_J2000 } from '../../../data/time/constJ2000';
import { deriveBodyStates } from './deriveBodyStates';

export function sceneBodyStates(
  state: EngineState,
  ctx: ReadyFrameContext,
): ReadonlyMap<string, BodyState> {
  return deriveBodyStates(CONST_J2000);
}
