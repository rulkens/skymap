/**
 * GalaxyArmTuning — the analytic field's spiral-arm ridge blobs
 * (`pushArmRidges`) and the sprite tier that shares their excess.
 */
import type { GalaxyArmCloudTuning } from './GalaxyArmCloudTuning';
import type { GalaxyArmSpurTuning } from './GalaxyArmSpurTuning';

export type GalaxyArmTuning = {
  /** Master toggle for `pushArmRidges`, mirrored to the section header checkbox. */
  readonly enabled: boolean;
  /**
   * Multiplies Reid et al. 2019's measured Milky Way maser-arm width law,
   * w(R) = 336 pc + 36 pc/kpc x (R - 8.15 kpc), which `armCrossSigma`
   * re-expresses in disc-scale-length units. 1 is that law exactly. The
   * measurement is of the YOUNG maser arm; old stellar arms are plausibly
   * broader, so above 1 is physical rather than a fudge.
   */
  readonly widthScale: number;
  /**
   * K: the arm/interarm surface-brightness ratio in old stellar light, scaled
   * per arm by that arm's own `age` so a young gas arm keeps only a floor of
   * it. 1.3 is the Milky Way's measured value (Drimmel & Spergel 2001 via
   * Antoja et al. 2011); strong grand designs reach ~2 (Rix & Zaritsky 1995).
   *
   * K is measured against the AZIMUTHALLY AVERAGED disc, which already
   * contains the arm light — so the excess `pushArmRidges` derives from it is
   * debited back out of the disc components rather than added to them (pinned
   * by `galaxyFieldFluxLedger.test.ts`).
   */
  readonly contrast: number;
  /**
   * The arm excess's exponential scale length in units of the disc's own —
   * the single radial law both arm tiers read (`armExcessSurfaceShape`). At 1
   * the excess tracks the disc exactly (holds `contrast` constant with
   * radius); above 1 it falls off more slowly and K grows outward. Growth is
   * the observed direction (arm light is gas and young stars, whose discs run
   * more extended than the old stellar one), but the ratio itself is a look
   * knob, not a measured quantity.
   *
   * The law pivots at `armFullRadius`, so the knob brightens the outer arm
   * rather than rescaling the whole system. Past `armEdgeVar` ~0.55 a
   * shortened arm's taper can start inside that pivot.
   */
  readonly excessScaleRatio: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly blobSharpness: number;
  readonly cloud: GalaxyArmCloudTuning;
  /** Interarm spurs/feathers, off the same excess the ridge chain and cloud share — see `GalaxyArmSpurTuning`. */
  readonly spurs: GalaxyArmSpurTuning;
};
