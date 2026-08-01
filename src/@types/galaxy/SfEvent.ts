/**
 * SfEvent — one seeded star-formation event on a young arm, placed by
 * `buildSfEventCatalog`. `age01` 0 = newborn (future HII knot), 1 = oldest
 * visible relic (largest swept bubble) — the single placement truth shared
 * by dust bubbles now and HII knots later (design doc N3).
 */
export type SfEvent = {
  readonly armIndex: number;
  readonly logR: number;
  readonly acrossOffset: number;
  readonly age01: number;
  readonly strength: number;
};
