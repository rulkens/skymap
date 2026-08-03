/**
 * GalaxyPopulationCountShares — each structural population's share of one
 * galaxy's STAR COUNT, summing to 1. Not light: the sprite tier multiplies
 * these by its star budget, and the analytic field uses them unscaled as its
 * mixture weights — the per-population brightness constant that turns a
 * count share into a light share lives separately (`generate.wesl`'s
 * per-population `* K` lines, mirrored in `galaxyFieldMixture.ts`).
 *
 * The bar's share is already carved out of `disk` (it is a fraction of the
 * whole galaxy, not of the disk), and `arm` is the spiral-arm/irregular-clump
 * population — the analytic field folds it back into its disc term.
 */
export type GalaxyPopulationCountShares = {
  readonly bulge: number;
  readonly bar: number;
  readonly disk: number;
  readonly arm: number;
  readonly halo: number;
};
