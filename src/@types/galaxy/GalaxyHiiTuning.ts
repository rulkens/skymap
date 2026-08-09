import type { GalaxyHiiDigTuning } from './GalaxyHiiDigTuning';
import type { GalaxyHiiShellsTuning } from './GalaxyHiiShellsTuning';
import type { GalaxyYoungStarsTuning } from './GalaxyYoungStarsTuning';

/**
 * GalaxyHiiTuning — the HII-region tier (`hiiRegions.ts`)'s cross-tier root.
 * Everything tier-specific (board item 19) now lives in one of the three
 * nested bags below, each with its OWN `brightness` GAIN multiplied against
 * this root's master (see each bag's own doc for how the two compose, and
 * `hiiRegions.ts`'s `buildHiiRegions`/`buildDigVeil` for where).
 */
export type GalaxyHiiTuning = {
  /** Master toggle — off skips the sprites, their cavities and their component-budget reservation. */
  readonly enabled: boolean;
  /**
   * Whole-field flux master: multiplies EVERY tier's own gain
   * (`shells.brightness`/`dig.brightness`/`youngStars.brightness`) rather
   * than doubling as the shells' own gain the way this field used to (F98
   * masked young features out of its fit, so HII emission ADDS light the
   * disc mixture owes no debit for — that reasoning applies to the master,
   * not to any one tier). 1 is the calibrated default.
   */
  readonly brightness: number;
  /**
   * Fraction of HII events placed from the ISM map's `activity` channel
   * instead of the arm-ridge catalog (0 = catalog exactly, 1 = fully
   * map-seeded). `activity`, not the long-lived `stars` tracer: ignition
   * zeroes gas and age together, so knots avoid the dust the same way M74's
   * do (Chevance decorrelation), and `activity`'s short memory keeps shells
   * on FRESH sites rather than 20-100 Myr drifted material `stars` now
   * carries. Stays cross-tier rather than moving into `shells`: it also
   * seeds DIG's own lifecycle population (`resolveEventLifecyclePopulation`),
   * not just the shells' own regions.
   */
  readonly ismMapSeeding: number;
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
