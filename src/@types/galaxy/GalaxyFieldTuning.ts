/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field's disc
 * (`discEnabled`, which also gates the warped outer disc's ring patches —
 * see `pushWarpedOuterDisc` in `galaxyFieldMixture.ts`, not independently
 * tunable) and spiral-arm ridge blobs (`pushArmRidges`). Optional on
 * `buildGalaxyFieldMixture`; omitted, the mixture reproduces today's fixed
 * constants exactly (see `DEFAULT_GALAXY_FIELD_TUNING`).
 */
export type GalaxyFieldTuning = {
  /**
   * Master toggle for the 8 unconditional base pushes (inner disc, bulge,
   * bar, halo) AND the warped outer disc's ring patches — one pill for the
   * whole smooth field, warp support included.
   */
  readonly discEnabled: boolean;
  /** Master toggle for `pushArmRidges`, mirrored to the section header checkbox. */
  readonly armsEnabled: boolean;
  /** Multiplies Reid et al. 2019's measured maser-arm width law; 1 is that law exactly. */
  readonly armWidthScale: number;
  /**
   * K: the arm/interarm surface-brightness ratio in old stellar light.
   * Drives `pushArmRidges`' contrast law, scaled per arm by that arm's own
   * `age`. 1.3 is the Milky Way's measured value (Drimmel & Spergel 2001).
   */
  readonly armContrast: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly armBlobSharpness: number;
};
