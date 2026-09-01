/**
 * keptCountFor — how many of `count` points a `fraction` Auto fit keeps: at
 * least 2 (a single-point box has no meaningful "densest fraction"), never
 * more than `count`. Shared by `denseFractionBounds`'s own eviction and
 * GridBoxPanel's evicts readout so the two can't drift apart.
 */
export function keptCountFor(count: number, fraction: number): number {
  return Math.min(count, Math.max(2, Math.ceil(fraction * count)));
}
