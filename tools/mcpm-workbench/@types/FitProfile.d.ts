/**
 * FitProfile — catalog points pre-sorted by distance-from-center rank, with
 * running bounds along that order, so "bounds of the tightest fraction" is an
 * O(1) prefix lookup (`fitProfileBounds`) instead of a per-call scan. Built
 * once by `buildFitProfile`.
 */
export type FitProfile = {
  readonly count: number;
  /** Interleaved xyz, length count*3. Entry k = min bounds over the k+1 points ranked
   * closest (by normalized L∞ distance from the robust center) up to and including rank k. */
  readonly prefixMin: Float32Array;
  /** Interleaved xyz, length count*3. Entry k = max bounds over the same k+1 points. */
  readonly prefixMax: Float32Array;
};
