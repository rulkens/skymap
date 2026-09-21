/**
 * GalaxyStarFormationParams — the seeded SF-event model's own knobs
 * (`sfEventCatalog.ts`), which is a different model from the fluid generator
 * on the field tuning's `ismMap` and shares nothing with it.
 *
 * Its own group rather than a corner of `GalaxyDustCloudParams`: nothing in
 * `dustParticleCloud.ts` reads either knob (it places from the ISM map and the
 * smooth disc), so folding them back in would put the whole cloud bag back in
 * `buildSfEventCatalog`/`buildHiiRegions`'s signatures to deliver one number.
 */
export type GalaxyStarFormationParams = {
  /** Poisson rate scale for arm SF events — 0 disables the catalog, and with it HII regions and the bubble overlay. */
  readonly sfActivity: number;
};
