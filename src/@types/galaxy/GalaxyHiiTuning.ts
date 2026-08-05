import type { GalaxyHiiDigTuning } from './GalaxyHiiDigTuning';

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
  /**
   * Multiplies each region's Strömgren radius — R_s ~ L^(1/3) off the same
   * Kennicutt luminosity draw that sets its brightness, anchored at 10 pc for
   * the faintest (`hiiRadiusUnits`). 1 is that law exactly.
   */
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
  /**
   * Fraction of HII events placed from the SF map's `recentSf` channel
   * instead of the arm-ridge catalog (0 = catalog exactly, 1 = fully
   * map-seeded). `recentSf`, not `gas x oldActivity`, deliberately: ignition
   * zeroes gas and age together, so knots avoid the dust the same way M74's
   * do (Chevance decorrelation).
   */
  readonly sfMapSeeding: number;
  /**
   * The DIG veil's own tuning — see `GalaxyHiiDigTuning`. Without it the
   * knots read as LEDs on black; leaking around them and tracing the arms is
   * the whole point.
   */
  readonly dig: GalaxyHiiDigTuning;
};
