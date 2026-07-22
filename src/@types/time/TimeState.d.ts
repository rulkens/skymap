/**
 * TimeState — the sim clock's *intent*: the user's decisions about how time
 * flows, and nothing else. There is no wall-clock tick in here.
 *
 * ### Anchor-not-accumulate
 *
 * A naive clock accumulates: each frame it adds `elapsed × rate` to a running
 * sim-time. That braids the user's intent (rate, direction, pause) with a
 * mutable accumulator the store would have to tick every frame — and a rate
 * change mid-flight would then have to reason about the already-accumulated
 * remainder. Instead the intent stores an *anchor*: the `(simDays, realMs)`
 * pair from which the current rate integrates. Sim time is never stored; it is
 * *derived* on demand by `deriveSimDays(time, nowMs)` as
 * `anchor.simDays + (nowMs − anchor.realMs) × rate × direction`. Every intent
 * action (change rate, flip direction, pause, scrub) re-anchors to the sim
 * instant it fired at, so the derivation stays a pure function of intent plus a
 * passed `nowMs` — no accumulator, no per-frame store write.
 *
 * `mode` distinguishes a `live` clock (anchored to wall-clock JD, so "now"
 * tracks real time) from a `manual` clock (anchored to a user-chosen instant).
 */

export type TimeState = {
  readonly mode: 'live' | 'manual';
  /** The (simDays JD at realMs) pairing from which playback integrates. */
  readonly anchor: { readonly simDays: number; readonly realMs: number };
  /** Index into `RATE_LADDER` — the unsigned playback speed. */
  readonly rateIndex: number;
  /** Sign of playback: `1` forward, `-1` reverse. Not a ladder entry. */
  readonly direction: 1 | -1;
  readonly paused: boolean;
};
