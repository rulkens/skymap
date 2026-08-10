/**
 * SPRITE_POPULATION_BRIGHTNESS — the per-star luminosity multiplier per
 * population: one entry per `randomLuminosity(...) * K` site in
 * `milkyWay/sprites/generate.wesl`, where `irregularClump` (the builder the
 * irregular category's `arm` count share runs through) has no `* K`.
 *
 * The flux path reads it BACKWARDS: `galaxyPopulationCountShares` divides a
 * population's light by it to learn how many sprites buy that much — unlike
 * the analytic field, whose amplitudes are light fractions already and so
 * apply no per-population multiplier at all.
 */
export const SPRITE_POPULATION_BRIGHTNESS: Readonly<
  Record<'bulge' | 'bar' | 'disk' | 'arm' | 'irregularClump' | 'halo', number>
> = Object.freeze({
  bulge: 0.85,
  bar: 0.9,
  disk: 1.35,
  arm: 1.9,
  irregularClump: 1.0,
  halo: 0.5,
});
