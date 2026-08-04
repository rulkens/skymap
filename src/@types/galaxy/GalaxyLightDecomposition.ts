/**
 * GalaxyLightDecomposition — how one galaxy's light divides across its four
 * structural populations.
 *
 * These are still `galaxyPopulationCountShares`' STAR-COUNT shares; each push
 * site in `galaxyFieldMixture` multiplies its own by the matching
 * `SPRITE_POPULATION_BRIGHTNESS` constant, so the light share is that product,
 * not the number here. The pair collapses into one honest luminosity when the
 * sprite anchor goes.
 */
export type GalaxyLightDecomposition = {
  readonly bulge: number;
  readonly bar: number;
  /** Arms included — the ridge chain redistributes disc light, it does not add any. */
  readonly disc: number;
  readonly halo: number;
};
