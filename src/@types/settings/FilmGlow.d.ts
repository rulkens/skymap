/**
 * FilmGlow — the film look's bloom-side knobs. `streakStrength` and `veil` at 0
 * are off (no passes), the rule `filmStreakOn` and `filmVeilOn` encode.
 */
export type FilmGlow = {
  /** Firefly cap in HDR units; equal to DEFAULT_BLOOM_CAP = no erosion. */
  cap: number;
  streakThreshold: number;
  streakStrength: number;
  streakLength: number;
  streakTint: number;
  veil: number;
};
