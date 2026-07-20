/**
 * classifyBound — turn a `scalingExponent` into a human label describing what a
 * pass's cost scales with.
 *
 * The exponent is the slope of GPU time vs pixel count in log-log space: ≈1 is
 * linear in pixels (fragment/fill-bound), ≈0 is resolution-independent
 * (vertex/CPU-bound), and the middle is a genuine mix of the two. The cut points
 * are HEURISTIC — GPU timings are noisy and the scales span only ~16× in area,
 * so we leave generous margins rather than pretend the slope is precise: 0.8
 * still reads as "essentially fill-bound", and anything under 0.3 as
 * "essentially flat". A `NaN` exponent (a pass unmeasurable at these scales —
 * see scalingExponent) is reported honestly as `'n/a'` rather than bucketed.
 */

/** At/above this the pass tracks pixels closely enough to call fill-bound. */
const FILL_BOUND_MIN = 0.8;
/** At/above this (but below FILL_BOUND_MIN) pixels matter but don't dominate. */
const MIXED_MIN = 0.3;

export function classifyBound(exponent: number): string {
  if (Number.isNaN(exponent)) return 'n/a';
  if (exponent >= FILL_BOUND_MIN) return 'fragment/fill-bound';
  if (exponent >= MIXED_MIN) return 'mixed';
  return 'vertex/CPU-bound';
}
