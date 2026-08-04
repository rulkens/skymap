/**
 * SPRITE_POPULATION_BRIGHTNESS — v1's per-star luminosity multiplier per
 * population: one entry per `randomLuminosity(...) * K` site in
 * `milkyWay/sprites/generate.wesl`, where `irregularClump` (the builder the
 * irregular category's `arm` count share runs through) has no `* K`.
 *
 * v1-only, and the flux path reads it BACKWARDS: it is what
 * `galaxyPopulationCountShares` divides a population's light by to learn how
 * many sprites buy that much of it. The analytic field applies none of them —
 * its amplitudes are light fractions already.
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
