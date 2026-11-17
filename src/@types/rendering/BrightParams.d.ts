/**
 * BrightParams — the bloom prefilter's knobs, packed into its uniform as
 * `[threshold, knee, cap, capFloor]`. `threshold` is the max-channel luma below
 * which a pixel contributes nothing; `cap` and `capFloor` bound how much any
 * single pixel can inject into the pyramid (the firefly clamp). Callers with no
 * film look pass `cap === capFloor === DEFAULT_BLOOM_CAP`.
 */
export type BrightParams = {
  readonly threshold: number;
  readonly cap: number;
  readonly capFloor: number;
};
