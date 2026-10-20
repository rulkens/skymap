/** Per-catalog constants `derivePointRecord` reads (per tier file). */
export type GalaxyPointStats = {
  /** Cosmetic shift moving the catalog's mean magnitude onto `SDSS_TARGET_MEAN_MAG`. */
  readonly magOffset: number;
  /** Physical median absolute magnitude `galaxySbAmp` normalises against. */
  readonly medianAbsMag: number;
};
