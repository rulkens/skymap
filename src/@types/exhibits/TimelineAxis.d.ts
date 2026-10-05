/**
 * TimelineAxis — a piecewise-linear time axis: `N + 1` ascending Unix-ms bounds make `N`
 * equal-width segments, so a crowded era can take as much track as a sparse one.
 */
export type TimelineAxis = { readonly boundsMs: readonly number[] };
