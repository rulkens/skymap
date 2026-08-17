/**
 * Constant half of the dust tier — the sprites themselves are GPU-placed
 * (`placeDust.wesl`, Task 7); this file survives only as the shared
 * constants/derivation `computePlaceDustBudget.ts`, `createIsmMapPlaceDust.ts`,
 * and `deriveDustHeaderLanes.ts` (the GPU dispatch hosts) still read.
 */
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';

/** Exported: createIsmMapPlaceDust.ts's GPU-side budget math reads the same fixed slot ceiling. */
export const MAX_PARTICLE_COUNT = 40000;

/**
 * GMC size function dN/dR ~ R^-2.2, over the measured 15-200 pc span —
 * absolute parsecs, not a fraction of the disc, since cloud sizes are set
 * by the ISM's own near-universal Jeans/turbulence physics.
 *
 * These bound the tier's contrast: per-cloud peak tau = dust.tau / f, with
 * covering factor f = N * 2*PI * elongation * <R^2> / A_disc. Oversized
 * clouds drive f into the tens and the tier reads as a smooth haze; f
 * around 2-3 is the target.
 *
 * `SIZE_MIN_PC` doubles as `sizeFloorPc`'s slider default and lower clamp —
 * raising the floor at fixed `count` raises mean R^2, hence f, which makes
 * every cloud fainter (mass renormalises to the tier's total via
 * `massPerR2 = totalMass / sumR2`).
 */
export const SIZE_MIN_PC = 15;
/** Exported: createIsmMapPlaceDust.ts's GPU-side size sampler reads the same span. */
export const SIZE_MAX_PC = 200;

/**
 * Base world span of one full wrap of the baked ridged-noise volume
 * (dustNoiseBake.wesl), parsecs, before `textureScale`. Its four octave
 * bands sit at 500/250/125/62 pc — straddling the 15-200 pc measured
 * cloud-size span above, so the erosion bites at the same scale the clouds
 * themselves live at.
 */
export const DUST_NOISE_TILE_PC = 500;

/** World-unit tile size at a given `textureScale` — the one place `pcToUnits` combines with `DUST_NOISE_TILE_PC`, so `createGalaxyEngine.ts` doesn't restate the conversion. */
export function dustNoiseTileUnits(textureScale: number): number {
  return pcToUnits(DUST_NOISE_TILE_PC) * textureScale;
}

/**
 * GMC associations run 300-800 pc; this is the child scatter's one-sigma,
 * before elongation. Not scaled by `sizeScale`, unlike the size draw below:
 * that knob's contract is the cloud size range, and a scatter tracking it
 * would translate every particle away from its complex's seed point rather
 * than growing each cloud in place.
 */
/** Exported: createIsmMapPlaceDust.ts's GPU-side child scatter reads the same one-sigma spread. */
export const COMPLEX_SPREAD_PC = 250;

/**
 * Survival floor, keyed on the same channel placement draws from (the map's
 * raw `dust` channel): a map-seeded particle whose texel sits below this is
 * dropped after placement — a post-filter that never touches the CDF
 * sampler's own rng stream, needed because cluster children scatter
 * `COMPLEX_SPREAD_PC` around their complex's seed and can straddle into a
 * true cavity the placement draw itself would never pick.
 *
 * A fraction of the sampled texel's own ring mean, not the map's global
 * mean: a cavity is low relative to its ring, not the whole disc — the
 * outer disc's honest faintness must not mass-cull splats the radial
 * envelope legitimately placed there. An absolute constant doesn't work
 * either, since the ambient pedestal varies by radius and simulation time.
 *
 * Exported: the "seeding" debug view in `ismMapPresent.wesl` mirrors this
 * fraction (parity-tested in `constants.parity.test.ts`).
 */
export const DUST_SURVIVAL_FLOOR_FRAC = 0.01;
