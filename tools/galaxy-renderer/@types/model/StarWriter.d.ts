/**
 * StarWriter — the sink the generator's population passes (bulge, disk,
 * arms, halo, globulars) write into. Backed by one pre-sized Float32Array
 * (capacity = the `StarBudget` total) so no population needs to know about
 * any other's share; `view()` returns a zero-copy subarray of just the
 * filled region for handing to the GPU, since the pre-sized backing array is
 * intentionally over-allocated for population-count rounding.
 */

export type StarWriter = {
  write(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    size: number,
    brightness: number,
  ): void;
  /** Records written so far. */
  readonly count: () => number;
  /** Zero-copy subarray of the filled region. */
  readonly view: () => Float32Array;
};
