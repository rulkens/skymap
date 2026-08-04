/**
 * MILKY_WAY_GALAXY_PARAMS — the single canonical `GalaxyParams` for the
 * Milky Way, shared by the galaxy-renderer tool's reference gallery
 * (`tools/galaxy-renderer/src/data/referenceGalaxies.ts`, `id: 'mw'`) and
 * the main app's Milky Way point cloud (`milkyWayCloud` generation).
 * One object means the tool and the app can never quietly drift onto two
 * different "Milky Way"s — tune it here and both pick up the change.
 *
 * The knobs themselves (SBb, 4 arms, bar, warp) are the tool's hand-dialled
 * approximation of the real galaxy: a central bar tilted ~45° to the
 * Sun–centre line, four main arm segments (Norma, Scutum–Centaurus,
 * Sagittarius, Perseus), and a warped, twisted outer disk matching the
 * Cepheid-mapped warp (Chen et al. 2019). See `referenceGalaxies.ts`'s
 * `mw` entry for the prose description shown in the tool's UI.
 */
import type { GalaxyParams } from '../../@types/galaxy/GalaxyParams';

/**
 * Fixed generation seed. `packGenerationUniforms.ts` derives an undefined
 * `params.seed` as `((seed ?? 0) | 0 || 1)` (see its `mainStream`/`seed`
 * locals) — so leaving `seed` unset was already, implicitly, seed 1. Every
 * "Milky Way" render anyone has looked at in the tool so far used that
 * default; pinning it to `1` here makes the implicit explicit rather than
 * changing what gets drawn.
 */
export const MILKY_WAY_GENERATION_SEED = 1;

/**
 * SBb, 4 arms, bar, warp — the tool's hand-dialled `mw` knobs, with the
 * generation seed made explicit (see `MILKY_WAY_GENERATION_SEED`) and
 * `globularCount` calibrated at the app's visual gate (the tool's gallery
 * shares this object, so it shows the same count). `starCount` is the
 * MEDIUM-tier star budget, also visual-gate calibrated; the per-tier table
 * in `milkyWayCalibration.ts` derives small/large as x0.5/x2 of this value
 * rather than carrying three independently-tunable variants.
 */
export const MILKY_WAY_GALAXY_PARAMS: GalaxyParams = {
  type: 'SBb',
  armCount: 4,
  armWinding: 0.32,
  armWidth: 1.5,
  armStrength: 1.0,
  subArms: 0.66,
  armFalloff: 0.48,
  armEdgeVar: 0.48,
  armClump: 0.62,
  armWave: 0.94,
  barStrength: 0.6,
  bulgeSize: 0.45,
  bulgeFalloff: 0.7,
  dust: 0.5,
  dustNoise: 0.5,
  dustNoiseScale: 1.65,
  hii: 1.35,
  youngStars: 0.56,
  metallicity: 0.56,
  diskThickness: 0.5,
  warpStrength: 0.15,
  warpTwist: 2.4,
  irregularity: 0.6,
  globularCount: 30,
  radius: 1.05,
  starCount: 75000,
  seed: MILKY_WAY_GENERATION_SEED,
};
