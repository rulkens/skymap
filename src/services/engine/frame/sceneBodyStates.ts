/**
 * sceneBodyStates — resolve THE per-frame map of every scene body's
 * time-varying `BodyState` (position, orientation, orbital phase) from live
 * engine state, keyed by id. The per-frame binding of `deriveBodyStates`.
 *
 * ### The sole epoch-choice site
 *
 * `deriveBodyStates(simDays)` is pure over a sim-day scalar; this thin adapter
 * is the ONE place the scene chooses which instant to evaluate. It binds the
 * epoch to `ctx.simDays` — the frame's sim-clock instant, derived once by
 * `runFrame` from the time-intent slice — so every per-frame consumer (the
 * planets, textured-bodies, and orbit-trail layers) reads one map, derived
 * once, at one agreed epoch.
 *
 * Per-frame consumers must therefore never call `deriveBodyStates(...)`
 * directly with an epoch of their own: if two layers each picked an instant
 * they could drift apart and draw the same body at two positions. The epoch
 * lives here and only here — advancing the clock is a matter of `runFrame`
 * stamping a new `ctx.simDays`, with no consumer touched.
 *
 * ### `state` unread
 *
 * The signature mirrors its peer `sceneBodyPartition` (takes `state`, `ctx`;
 * returns the map) so all per-frame body binders share one shape. `state` is
 * unread: the epoch this needs lives on `ctx.simDays`, and the element table is
 * a compile-time import, so nothing on `EngineState` is consulted. The
 * parameter stays for signature parity across the body binders.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { BodyState } from '../../../@types/scene/BodyState';
import { deriveBodyStates } from './deriveBodyStates';

export function sceneBodyStates(
  state: EngineState,
  ctx: ReadyFrameContext,
): ReadonlyMap<string, BodyState> {
  return deriveBodyStates(ctx.simDays);
}
