/**
 * TimelineAxis — a piecewise-linear time axis: `N + 1` ascending Unix-ms bounds make `N`
 * equal-width segments, so a mission leg of months takes as much track as one of decades.
 */
export type TimelineAxis = { readonly boundsMs: readonly number[] };
