/**
 * GalaxyPopulationCountShares — each structural population's share of one
 * galaxy's STAR COUNT, summing to 1. A sprite-tier rendering budget, derived
 * FROM `GalaxyLightDecomposition` by dividing each lane's light by what one of
 * its stars emits (`SPRITE_POPULATION_BRIGHTNESS`) — never the source of it.
 *
 * `bar` is its own share here, not a slice of `disk`: the two populations have
 * their own light and their own per-star brightness, so a fixed disk-to-bar
 * ratio would have been a third, unrelated number. `arm` is the spiral-arm /
 * irregular-clump population, drawn out of the disc's light rather than a lane
 * of its own — see `GalaxyLightDecomposition.disc`.
 */
export type GalaxyPopulationCountShares = {
  readonly bulge: number;
  readonly bar: number;
  readonly disk: number;
  readonly arm: number;
  readonly halo: number;
};
