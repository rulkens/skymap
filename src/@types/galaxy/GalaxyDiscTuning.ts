/**
 * GalaxyDiscTuning — the analytic field's smooth-disc section, one pill wide.
 */
export type GalaxyDiscTuning = {
  /**
   * Master toggle for the 8 unconditional base pushes (inner disc, bulge,
   * bar, halo) AND the warped outer disc's ring patches — one pill for the
   * whole smooth field, warp support included. The ring patches are
   * `pushWarpedOuterDisc` in `galaxyFieldMixture.ts`, not independently
   * tunable.
   */
  readonly enabled: boolean;
};
