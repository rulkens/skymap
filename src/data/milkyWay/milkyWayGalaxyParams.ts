/**
 * MILKY_WAY_GALAXY_PARAMS — the single canonical `GalaxyParams` for the
 * Milky Way, shared by the galaxy-renderer tool's reference gallery
 * (`tools/galaxy-renderer/src/data/referenceGalaxies.ts`, `id: 'mw'`) and
 * the main app's Milky Way point cloud (`milkyWayCloud` generation).
 * One object means the tool and the app can never quietly drift onto two
 * different "Milky Way"s — tune it here and both pick up the change.
 *
 * Most knobs (arms, dust, bulge, brightness) are hand-dialled to look right;
 * the ones measured against the real Galaxy carry their derivation inline.
 */
import type { GalaxyParams } from '../../@types/galaxy/GalaxyParams';
import { DEFAULT_GALAXY_DUST_CLOUD_PARAMS } from '../../services/engine/galaxyGenerator/v2/defaultGalaxyDustCloudParams';
import { MILKY_WAY_DISC_RADIUS_KPC } from './galacticCenter';

/**
 * Fixed generation seed. `packGenerationUniforms.ts` derives an undefined
 * `params.seed` as `((seed ?? 0) | 0 || 1)`, so leaving `seed` unset was
 * already, implicitly, seed 1 — pinning it makes that explicit rather than
 * changing what gets drawn.
 */
export const MILKY_WAY_GENERATION_SEED = 1;

/**
 * Exponential scale length of the disc's LIGHT, kpc (Freudenreich 1998).
 * `buildDisk` weights an exp(-R/diskScaleLen) surface density by
 * `diskFalloff(R, 1.7)`, so the emitted light falls off 1 + 1/1.7 times
 * faster than the density does — and an additive point cloud integrates
 * light, not star counts, so it is the light profile that must match.
 */
const DISC_LIGHT_SCALE_KPC = 2.605;
const DENSITY_PER_LIGHT_SCALE = 1 + 1 / 1.7;

/**
 * SBb, 4 arms, bar, warp. `globularCount` and `starCount` are visual-gate
 * calibrated (the tool's gallery shares this object, so it shows the same);
 * `starCount` is the MEDIUM-tier budget, off which `milkyWayCalibration.ts`
 * derives small/large as x0.5/x2 rather than carrying three variants.
 */
export const MILKY_WAY_GALAXY_PARAMS: GalaxyParams = {
  type: 'SBb',
  armCount: 4,
  armWinding: 0.32,
  armWidth: 1.5,
  armStrength: 1.0,
  subArms: 0.66,
  // Hand-calibrated by eye, not measured: arm extent has no published Milky Way
  // value to pin it to. Lands the arms at 1.07 x outerRadius (see
  // `describeGalaxy.ts`'s ARM_EXTENT lerp).
  armFalloff: 0.6,
  armEdgeVar: 0.48,
  armClump: 0.62,
  armWave: 0.94,
  barStrength: 0.6,
  // The long bar's angle to the Sun–centre line (Wegg & Gerhard 2013; Wegg,
  // Gerhard & Portail 2015), NOT Freudenreich 1998's 13.79°, which describes
  // the boxy bulge alone. Pinned rather than drawn because the draw landed at
  // 2.6°, all but along our line of sight — the one orientation the real bar
  // is known not to have. `barStrength` still sets the LENGTH (4.41 kpc here).
  barAngleDeg: 27,
  // Old-star (K-band) light traces only TWO arms — Scutum-Centaurus and
  // Perseus — while young tracers (HII/CO/masers) ride all four (Drimmel &
  // Spergel 2001). armCount is 4 for the young structure, and armTable's
  // arms alternate phase by construction, so pinning ages [old, young, old,
  // young] puts the two K-band arms opposite each other, matching the sky.
  armAges: [1.0, 0.2, 1.0, 0.2],
  bulgeSize: 0.45,
  bulgeFalloff: 0.7,
  spriteDust: 0.5,
  dustNoise: 0.5,
  dustNoiseScale: 1.65,
  hii: 1.35,
  youngStars: 0.56,
  metallicity: 0.56,
  // F98's vertical profile is sech²(Z / 0.346 kpc); the Gaussian of equal
  // variance (π²h²/12) has σ = 0.314 kpc, and `packGenerationUniforms` builds
  // the disc at diskHeight = 0.055 * outerRadius * this — 0.188 units here.
  diskThickness: 0.33,
  // A fraction of `outerRadius`, which `milkyWayCalibration.ts` maps onto
  // MILKY_WAY_DISC_RADIUS_KPC — so a ratio of two kpc lengths is already the
  // ratio in generator units, no conversion needed. h_light = 2.605 kpc.
  diskScaleLenFrac: (DENSITY_PER_LIGHT_SCALE * DISC_LIGHT_SCALE_KPC) / MILKY_WAY_DISC_RADIUS_KPC,
  // 1.05 kpc of vertical bend at the disc edge. UNVERIFIED: a plausible
  // ballpark, with no published amplitude retrieved to check it against.
  warpStrength: 0.15,
  // 0.35 rad = 20°: the line of nodes Chen et al. 2019 map with Cepheids
  // (mean 17.5°, flat beyond ~14 kpc), not a full turn of precession.
  warpTwist: 0.35,
  // Warp onset at ~10 kpc, outside the Sun's 8 kpc orbit; the shared 0.3
  // default would start bending the disc at 5.25 kpc, well inside it.
  warpStart: 0.57,
  irregularity: 0.6,
  globularCount: 30,
  radius: 1.05,
  starCount: 75000,
  seed: MILKY_WAY_GENERATION_SEED,
  // tau above the measured 0.5–1 face-on range, and R_V below the diffuse-ISM
  // 3.1 (Cardelli, Clayton & Mathis 1989) — both departures are deliberate and
  // both pull the same way; see DEFAULT_GALAXY_DUST_PARAMS for the reasoning.
  // heightRatio 0.35 because the MW's dust layer is notably thin: ~100–134 pc
  // scale height vs the ~314 pc stellar sigma (Drimmel & Spergel 2001;
  // Misiriotis et al. 2006).
  dust: {
    tau: 1.25,
    scaleLenRatio: 1.5,
    heightRatio: 0.35,
    rV: 2.3,
    // The shared defaults BY REFERENCE, not a restated copy: this block once
    // said "same values as the defaults" while silently drifting from them
    // (clumpiness 0.6 after the defaults went 0), and the tool boots into
    // this preset — so the drift masqueraded as the defaults themselves.
    // Replace with a literal block only when a MW-specific calibration
    // deliberately diverges.
    cloud: DEFAULT_GALAXY_DUST_CLOUD_PARAMS,
  },
  // Not yet visually calibrated — same values as
  // DEFAULT_GALAXY_STAR_FORMATION_PARAMS.
  starFormation: {
    sfActivity: 1,
    bubbleScale: 1,
  },
};
