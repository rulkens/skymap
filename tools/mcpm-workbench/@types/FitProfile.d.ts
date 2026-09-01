/**
 * FitProfile — catalog points pre-sorted by distance-from-center rank, with
 * running bounds along that order, so "bounds of the tightest fraction" is an
 * O(1) prefix lookup (`fitProfileBounds`) instead of a per-call scan. Built
 * once by `buildFitProfile`.
 */
export type FitProfile = {
  readonly count: number;
  /** Point indices into the source `positions`, ascending by normalized L∞ distance from the robust center. */
  readonly sortedIndices: Uint32Array;
  /** Interleaved xyz, length count*3. Entry k = min bounds over sortedIndices[0..k]. */
  readonly prefixMin: Float32Array;
  /** Interleaved xyz, length count*3. Entry k = max bounds over sortedIndices[0..k]. */
  readonly prefixMax: Float32Array;
};
