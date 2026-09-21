/**
 * StarBudget — the star-count split across the five populations the generator
 * draws (bulge, bar, disk, spiral arms, halo). `totalStars` is carried on the
 * type (not left implicit as the sum of the other five) so scale constants
 * derived from it — e.g. grainScale, which controls per-star jitter — and the
 * population split itself share one derivation instead of recomputing
 * `max(20000, floor(starCount ?? 400000))` at each call site.
 */

export type StarBudget = {
  readonly totalStars: number;
  readonly bulgeCount: number;
  /** Zero for every category `barLengthOf` builds no bar for. */
  readonly barCount: number;
  /** The SMOOTH disk alone — the bar carries its own count above. */
  readonly diskCount: number;
  readonly armStarCount: number;
  readonly haloCount: number;
};
