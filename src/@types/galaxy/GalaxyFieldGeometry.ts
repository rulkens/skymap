/**
 * GalaxyFieldGeometry — everything the analytic field mixture needs about one
 * generated galaxy: the derived lengths the generation shader reads out of its
 * UBO, the orientations its RNG already drew, and each population's share of
 * the modelled star COUNT (not light — see `GalaxyPopulationCountShares`).
 *
 * It exists so the mixture is a function of what generation ACTUALLY ran with
 * rather than of `GalaxyParams` re-derived a second time — the bar and bulge
 * tilts are single RNG draws, and re-drawing them would silently misalign the
 * field against the sprites.
 */
import type { GalaxyCategory } from './GalaxyCategory';
import type { GalaxyFieldArmRecord } from './GalaxyFieldArmRecord';
import type { HiiPalette } from './HiiPalette';

export type GalaxyFieldGeometry = {
  readonly category: GalaxyCategory;
  readonly outerRadius: number;
  /** Surface-density scale length of the sampled disc, before its brightness taper. */
  readonly diskScaleLen: number;
  readonly bulgeRadius: number;
  /** Gaussian sigma of the disc's vertical scatter, before `buildDisk`'s radial flare. */
  readonly diskHeight: number;
  /** Bulge/halo squash along the pole (`buildBulge`'s bulgeAxisY). */
  readonly flattening: number;
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
  /** Fraction of the modelled star budget in the smooth disc (clumps AND spiral arms folded in — the arm ridge's flux is derived from disc contrast, not a star-budget share). */
  readonly discFraction: number;
  readonly bulgeFraction: number;
  readonly barFraction: number;
  readonly haloFraction: number;
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
  /** `hiiPalette(params.metallicity)`, read back from the SAME UBO lanes the sprite tier shades its HII knots from — metallicity itself is never packed, so this is how both tiers share one palette instead of two. */
  readonly hiiPalette: HiiPalette;
  /** Per-arm phase/pitch/weight/meander/clump/wave records, `numArms` long. */
  readonly arms: readonly GalaxyFieldArmRecord[];
  /** Base sprite half-extent in generator units, before each star's size jitter. */
  readonly starSize: number;
  /** The sprite tier's star budget, which the mixture's absolute flux is calibrated AGAINST (`emissionScale`, `hiiRegions`' `tierFlux`) so analytic exposure 1.0 means sprite-flux parity. Not what the fractions above are shares of — those are weights in their own right. */
  readonly modelledStars: number;
  /** The generation UBO's own `seed` (`packGenerationUniforms`'s `params.seed`), for field-side stochastic tiers (e.g. the arm particle cloud) that need the SAME seed the sprites were drawn with, not a re-derivation. */
  readonly seed: number;
};
