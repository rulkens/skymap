/**
 * StarBudget — the star-count split across the four populations the
 * generator draws (bulge, disk, spiral arms, halo). `totalStars` is carried
 * on the type (not left implicit as the sum of the other four) so scale
 * constants derived from it — e.g. grainScale, which controls per-star jitter
 * — and the population split itself share one derivation instead of
 * recomputing `max(20000, floor(starCount ?? 400000))` at each call site.
 */

export type StarBudget = {
  readonly totalStars: number;
  readonly bulgeCount: number;
  readonly diskCount: number;
  readonly armStarCount: number;
  readonly haloCount: number;
};
