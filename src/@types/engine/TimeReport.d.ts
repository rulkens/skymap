/**
 * TimeReport — the engine's throttled, observable snapshot of the sim clock and
 * the focused body's live distance, dispatched to the store via
 * `engineTimeReported`.
 *
 * This is engine-REPORTED state (like `ScaleInfo`), not user intent. The user's
 * time *intent* — mode, rate, direction, pause, scrub anchor — lives on the
 * `time` slice; `simDays` here is the value `deriveSimDays(time, nowMs)` produced
 * on the frame this report was published. Publishing it to the store lets the
 * TimeBar readout and the InfoCard live rows subscribe to a derived instant
 * without every subscriber deriving it (or reading `performance.now()`)
 * themselves.
 *
 * `focusedBodyDistanceMpc` rides the same payload because a presentational card
 * cannot read the engine's per-frame snapshot (store-boundary rule); the engine
 * derives it from the frame snapshot when a scene body is focused, and null when
 * there is no body focus. Bundling it with `simDays` keeps it under the SAME
 * throttle gate and dedup guard — one payload, one dispatch a few Hz.
 */

export type TimeReport = {
  /** Derived Julian-Day sim instant on the frame this report was published. */
  simDays: number;
  /**
   * Distance from the camera to the currently-focused scene body, in Mpc, or
   * null when no scene body is focused. Derived engine-side from the frame
   * snapshot; the InfoCard live-distance row reads it straight from the store.
   */
  focusedBodyDistanceMpc: number | null;
};
