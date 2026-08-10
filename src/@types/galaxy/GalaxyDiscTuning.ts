/**
 * GalaxyDiscTuning — the analytic field's smooth-disc section, one pill wide.
 */
export type GalaxyDiscTuning = {
  /** Master toggle for the unconditional base pushes (inner disc, bulge, bar, halo) AND the warped outer disc's ring patches (`pushWarpedOuterDisc` in `galaxyFieldMixture.ts`) — one pill for the whole smooth field. */
  readonly enabled: boolean;
};
