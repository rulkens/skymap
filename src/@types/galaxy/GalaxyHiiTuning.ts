import type { GalaxyHiiDigTuning } from './GalaxyHiiDigTuning';
import type { GalaxyHiiShellsTuning } from './GalaxyHiiShellsTuning';
import type { GalaxyYoungStarsTuning } from './GalaxyYoungStarsTuning';

/**
 * GalaxyHiiTuning — the HII-region tier (`hiiRegions.ts`)'s cross-tier root.
 * Everything tier-specific lives in one of the three nested bags below, each
 * with its OWN `brightness` GAIN multiplied against this root's master (see
 * each bag's own doc for how the two compose, and `hiiRegions.ts`'s
 * `buildHiiRegions`/`buildDigVeil` for where).
 */
export type GalaxyHiiTuning = {
  /** Master toggle — off skips the sprites, their cavities and their component-budget reservation. */
  readonly enabled: boolean;
  /**
   * Whole-field flux master: multiplies EVERY tier's own gain
   * (`shells.brightness`/`dig.brightness`/`youngStars.brightness`). HII
   * emission ADDS light the disc mixture owes no debit for — F98's fit
   * masked young features out — so this stacks on top rather than
   * redistributing anything. 1 is the calibrated default.
   */
  readonly brightness: number;
  /**
   * The emission-shell tier's own tuning (radius/thickness/cluster/cavity/
   * texture) — see `GalaxyHiiShellsTuning`.
   */
  readonly shells: GalaxyHiiShellsTuning;
  /**
   * The DIG veil's own tuning — see `GalaxyHiiDigTuning`. Without it the
   * knots read as LEDs on black; leaking around them and tracing the arms is
   * the whole point.
   */
  readonly dig: GalaxyHiiDigTuning;
  /**
   * The chain-placed young-stars tier's own tuning — see
   * `GalaxyYoungStarsTuning`. Without it the shells fade at ~5 Myr with
   * nothing standing in for the naked cluster left behind.
   */
  readonly youngStars: GalaxyYoungStarsTuning;
};
