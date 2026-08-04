/**
 * GalaxyArmTuning — the analytic field's spiral-arm ridge blobs
 * (`pushArmRidges`) and the sprite tier that shares their excess.
 */
import type { GalaxyArmCloudTuning } from './GalaxyArmCloudTuning';

export type GalaxyArmTuning = {
  /** Master toggle for `pushArmRidges`, mirrored to the section header checkbox. */
  readonly enabled: boolean;
  /** Multiplies Reid et al. 2019's measured maser-arm width law; 1 is that law exactly. */
  readonly widthScale: number;
  /**
   * K: the arm/interarm surface-brightness ratio in old stellar light.
   * Drives `pushArmRidges`' contrast law, scaled per arm by that arm's own
   * `age`. 1.3 is the Milky Way's measured value (Drimmel & Spergel 2001).
   */
  readonly contrast: number;
  /**
   * The arm excess's exponential scale length in units of the disc's own —
   * 1 holds the arm/interarm contrast `contrast` constant with radius, above
   * 1 lets it grow outward. Governs BOTH arm tiers, so it is the radial
   * profile of the arms as such, not of one tier. See `armExcessSurfaceShape`
   * for the pivot and for what is and isn't measured about the value.
   */
  readonly excessScaleRatio: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly blobSharpness: number;
  readonly cloud: GalaxyArmCloudTuning;
};
