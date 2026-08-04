/**
 * GalaxyDescription — what one galaxy IS, independent of how it gets drawn:
 * the derived lengths, the orientations and per-arm personalities its
 * construction-time RNG drew, and how its light divides across populations.
 *
 * `describeGalaxy` is its only producer, and it owns every shared RNG draw a
 * galaxy has. Both tiers are then readers: `packGenerationUniforms` writes
 * this out as v1's generation UBO, and `buildGalaxyFieldMixture` builds v2's
 * Gaussians from it. Neither re-derives — a second draw sequence would
 * silently misalign the field's bar and bulge against the sprites'.
 */
import type { GalaxyCategory } from './GalaxyCategory';
import type { GalaxyFieldArmRecord } from './GalaxyFieldArmRecord';
import type { GalaxyLightDecomposition } from './GalaxyLightDecomposition';
import type { HiiPalette } from './HiiPalette';
import type { Vec3 } from '../math/Vec3';

export type GalaxyDescription = {
  readonly category: GalaxyCategory;
  readonly light: GalaxyLightDecomposition;
  /**
   * Total emitted light, in the analytic field's own arbitrary units — the
   * scale every mixture amplitude and the HII tier's flux are shares of.
   * `GALAXY_LUMINOSITY_PER_AREA * outerRadius^2`, because an exponential
   * disc's flux is its central surface brightness times scale length squared
   * (Freeman 1970) and this model holds that brightness fixed across presets,
   * so SIZE carries all of it.
   *
   * Deliberately not a function of v1's star budget: that is an LOD number,
   * and while flux was anchored on it the anchor went as N^(1/3), so switching
   * tier changed how bright a galaxy is by 26% a step. This type no longer
   * names a sprite quantity at all — `StarBudget` lives under `v1/` and never
   * reaches here. Nor of any per-population sprite multiplier: `light`'s lanes
   * are light fractions summing to 1, so this IS the galaxy's total emitted
   * light and every preset now emits strictly what its disc area says it does.
   *
   * The additive HII tier rides on top of it rather than inside it
   * (`hiiRegions.ts`'s `HII_LUMINOSITY_SHARE`), because those regions are
   * young-star light the smooth populations were never fit to carry.
   */
  readonly luminosity: number;
  readonly outerRadius: number;
  /** Surface-density scale length of the sampled disc, before its brightness taper. */
  readonly diskScaleLen: number;
  readonly bulgeRadius: number;
  /** Gaussian sigma of the disc's vertical scatter, before `buildDisk`'s radial flare. */
  readonly diskHeight: number;
  /** Bulge/halo squash along the pole (`buildBulge`'s bulgeAxisY). */
  readonly flattening: number;
  /** How lopsided the whole galaxy is (`params.irregularity`); the amplitudes below scale off it. */
  readonly asymmetry: number;
  /** Fractional radius modulation of the m=1 lopsided mode — an RNG draw. */
  readonly lopsidedAmp: number;
  /** In-plane angle the lopsided mode peaks at, radians — an RNG draw. */
  readonly lopsidedAngle: number;
  /** Bulge squash along its own in-plane +Z. */
  readonly bulgeAxisZ: number;
  /** Bulge in-plane rotation about the pole, radians — an RNG draw, not a formula. */
  readonly bulgeTiltRad: number;
  /** Drives both spheroids' brightness falloff lengths (`params.bulgeFalloff`). */
  readonly bulgeConcentration: number;
  /** Zero for every non-barred category, which is what drops the bar component. */
  readonly barLength: number;
  /** Warp amplitude, a fraction of `outerRadius` (times 0.4) at the disc edge; 0 disables the warp. */
  readonly warpStrength: number;
  /** Radians the warp's line of nodes precesses over the warped span. */
  readonly warpTwist: number;
  /** Generator units, ALREADY multiplied out of `params.warpStart` — inside it the disc is flat. */
  readonly warpStartRadius: number;
  /** Bar in-plane rotation about the pole, radians — an RNG draw, not a formula. */
  readonly barTiltRad: number;
  /** Number of arms the generator drew, `gen.armTable`'s live prefix (max 8). */
  readonly numArms: number;
  /** Radius below which every arm is flat/absent — `armStarSample`'s smooth-start floor. */
  readonly armStartRadius: number;
  /** Radial span over which an arm's brightness ramps up from `armStartRadius`. */
  readonly armInnerRampW: number;
  /** Radius past which an arm's brightness begins its outer fade toward its own `fadeRadius`. */
  readonly armFullRadius: number;
  /** Perpendicular/angular scatter factor shared by every arm's cross-section. */
  readonly armWidthFactor: number;
  /** High-frequency wave-modulation amount added to every arm's ridge angle. */
  readonly waveAmount: number;
  /** Along-arm clump/gap modulation amount; 0 disables both `clumpMod` and the gap-survival term. */
  readonly clumpAmount: number;
  /** Blue-star fraction, also nudges the ridge blobs' colour young/old. */
  readonly youngFraction: number;
  /** `hiiPalette(params.metallicity)` — one palette both tiers shade their HII knots from. */
  readonly hiiPalette: HiiPalette;
  /** Per-arm phase/pitch/weight/meander/clump/wave records, always `numArms` long — zeroed for a category that draws no arms. */
  readonly arms: readonly GalaxyFieldArmRecord[];
  /** Where an irregular's star-forming clumps sit, model units — RNG draws. Empty for every other category. */
  readonly irregularClumpCenters: readonly Vec3[];
  /**
   * A lenticular's nuclear dust clouds as `[x, z, radius]` — RNG draws, and
   * note the pair is IN-PLANE (the shader reads `.y` as its z), with the third
   * lane the cloud's own radius rather than a height. Empty for every other
   * category.
   */
  readonly lenticularCloudCenters: readonly Vec3[];
  /** The generation seed, for field-side stochastic tiers (e.g. the arm particle cloud) that need the SAME seed the sprites were drawn with, not a re-derivation. */
  readonly seed: number;
};
