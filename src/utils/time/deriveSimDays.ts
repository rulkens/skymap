/**
 * deriveSimDays — resolve the sim clock's current instant (in Julian days) from
 * the user's *intent* plus a wall-clock `nowMs`, as a pure function.
 *
 * ### Why derive instead of accumulate
 *
 * `TimeState` stores an *anchor* — the `(simDays, realMs)` pair from which the
 * current rate integrates — not a running sim-time that a per-frame tick mutates.
 * That keeps intent (rate, direction, pause) un-braided from a mutable
 * accumulator: sim time is recomputed here on demand rather than carried. Every
 * intent action re-anchors, so this stays a total function of `(time, nowMs)`.
 *
 * ### The three regimes
 *
 * - **paused** ⇒ the anchor's `simDays` verbatim; `nowMs` cannot move it.
 * - **live** ⇒ real-time forward: exactly one sim day per real day, ignoring the
 *   rate ladder and direction (a wall-clock JD that tracks "now").
 * - **manual** ⇒ the anchor plus `simSecPerRealSec · direction · realDaysElapsed`,
 *   where `realDaysElapsed = (nowMs − anchor.realMs) / 86_400_000`. The
 *   `simSecPerRealSec / 86_400` day-conversion cancels cleanly: at the '1 day/s'
 *   detent one real second advances one sim day.
 *
 * ### Fail-loud on a bad rate index
 *
 * `RATE_LADDER[time.rateIndex]` is an unchecked indexed access (the repo runs
 * `noUncheckedIndexedAccess`), so an out-of-range `rateIndex` would otherwise
 * yield `undefined` and silently poison the derivation with `NaN`. We mirror the
 * house `findByIdOrThrow` stance — throw immediately with a context-labelled
 * message — rather than clamp or coalesce, because a rate index the ladder can't
 * satisfy is a programming error upstream, not a value to paper over here.
 */

import type { TimeState } from '../../@types/time/TimeState';
import { RATE_LADDER } from '../../data/time/rateLadder';

export function deriveSimDays(time: TimeState, nowMs: number): number {
  if (time.paused) return time.anchor.simDays;

  const realDaysElapsed = (nowMs - time.anchor.realMs) / 86_400_000;

  if (time.mode === 'live') return time.anchor.simDays + realDaysElapsed;

  const step = RATE_LADDER[time.rateIndex];
  if (step === undefined) {
    throw new Error(
      `deriveSimDays: rateIndex ${time.rateIndex} is out of RATE_LADDER bounds [0, ${RATE_LADDER.length})`,
    );
  }

  return time.anchor.simDays + step.simSecPerRealSec * time.direction * realDaysElapsed;
}
