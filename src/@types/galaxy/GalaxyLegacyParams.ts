/**
 * GalaxyLegacyParams — the knobs only v1 (the sprite generator) reads:
 * `packGenerationUniforms` and the carve/budget helpers under
 * `galaxyGenerator/v1/`. Dies with v1/ (see
 * `docs/research/milky-way/goal-and-history.md`). Every field optional;
 * defaults are applied at the point of use, unchanged from `GalaxyParams`.
 */

export type GalaxyLegacyParams = {
  readonly starCount?: number;
  /** Orphaned: only v1's `armWidthFactor` product reads it. Dies with v1. */
  readonly armWidth?: number;
  readonly armStrength?: number;
  readonly subArms?: number;
  /** v1 sprite-HII intensity — distinct from `GalaxyFieldTuning.hii`. */
  readonly hii?: number;
  /**
   * Legacy sprite-generator dust density. Renamed off the bare `dust` name,
   * which now names `GalaxyFieldTuning.dust` (the analytic dust lane) instead.
   */
  readonly spriteDust?: number;
  readonly dustNoise?: number;
  readonly dustNoiseScale?: number;
  readonly dustRing?: number;
  readonly dustRingWidth?: number;
  readonly dustRingStrength?: number;
  readonly globularCount?: number;
  readonly globularSize?: number;
  readonly globularBright?: number;
};
