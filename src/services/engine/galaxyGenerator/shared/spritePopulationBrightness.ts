/**
 * SPRITE_POPULATION_BRIGHTNESS — v1's per-star luminosity multiplier per
 * population: one entry per `randomLuminosity(...) * K` site in
 * `galaxyGen/generate.wesl`, where `irregularClump` (the builder the
 * irregular category's `arm` count share runs through) has no `* K`.
 * v2 applies only four: `describeGalaxy` folds `disk + arm` into one
 * `light.disc` weighted by `disk`, and the arm ridge chain then
 * debits the disc by exactly the excess it adds, so it carries no net flux
 * — a fifth `arm` lane would double-count rather than close that gap.
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
