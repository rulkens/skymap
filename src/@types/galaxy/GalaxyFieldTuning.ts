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
  /** Blobs per arm, spaced uniformly in log-radius from `armStartRadius` to that arm's own `fadeRadius`. */
  readonly armBlobsPerArm: number;
  /** Multiplies every blob's across-arm (radial) sigma; 1 matches `armWidthFactor`'s own scale. */
  readonly armWidthScale: number;
  /** Whole-arm-population flux multiplier over the un-folded `armFraction` share; 1 is parity with the sprite arms. */
  readonly armFluxBoost: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly armBlobSharpness: number;
};
