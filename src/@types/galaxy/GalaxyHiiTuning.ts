/**
 * GalaxyHiiTuning — the HII-region tier (`hiiRegions.ts`): discrete emission
 * shells, their OB cluster cores, and the dust cavities they carve.
 */
export type GalaxyHiiTuning = {
  /** Master toggle — off skips the sprites, their cavities and their component-budget reservation. */
  readonly enabled: boolean;
  /**
   * Whole-tier flux multiplier. Unlike `GalaxyArmCloudTuning.share` this ADDS
   * light: F98 masked young features out of its fit, so HII emission was never
   * inside the disc mixture and owes it no debit. 1 is the calibrated default.
   */
  readonly brightness: number;
  /** Multiplies the Strömgren radius from `hiiRadiusUnits`; 1 is that law exactly. */
  readonly radiusScale: number;
  /** Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front. */
  readonly shellThickness: number;
  /** 0..1 brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell. */
  readonly clusterStrength: number;
  /**
   * Radius of the dust cavity a young event carves, as a fraction of its
   * HII radius. 0 leaves the dust undisturbed, which makes the glow read as
   * a smudge behind a curtain rather than a hole with a lit wall.
   */
  readonly cavityScale: number;
};
