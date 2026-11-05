/**
 * ClipPathTuningActive — the clip-path inspector's per-knob override gates.
 *
 * Each flyPath pacing knob the inspector exposes (align / rampSec / linger /
 * spline) is an OVERRIDE that is inactive until the curator touches it. A `true`
 * here means that knob is baked into the clip at Calculate time; a `false` lets
 * the clip's own authored value flow through untouched. Splitting the gates out
 * from the values keeps "is this knob overriding?" separate from "what value
 * would it override with", so a slider can hold a sensible position while still
 * being inactive.
 *
 * `spline` and `passBy` are each ONE gate for a whole config — the causal-only
 * sub-knobs (turnDelay / lookAhead) ride the `spline` gate, and the fly-past
 * sub-knobs (offset / direction) ride the `passBy` gate, rather than getting
 * their own gates (see `SplineConfig` / `PassByConfig`).
 */
export type ClipPathTuningActive = {
  align: boolean;
  rampSec: boolean;
  linger: boolean;
  spline: boolean;
  passBy: boolean;
};
