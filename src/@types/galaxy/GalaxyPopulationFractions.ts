/**
 * GalaxyPopulationFractions — each structural population's share of one
 * galaxy's light, summing to 1. Shares, not counts: the sprite tier
 * multiplies them by its star budget, the analytic field uses them as
 * mixture weights, and neither reading is privileged.
 *
 * The bar's share is already carved out of `disk` (it is a fraction of the
 * whole galaxy, not of the disk), and `arm` is the spiral-arm/irregular-clump
 * population — the analytic field folds it back into its disc term.
 */
export type GalaxyPopulationFractions = {
  readonly bulge: number;
  readonly bar: number;
  readonly disk: number;
  readonly arm: number;
  readonly halo: number;
};
