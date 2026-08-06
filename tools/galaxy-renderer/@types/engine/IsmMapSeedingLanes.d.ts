/**
 * SfMapSeedingLanes — the SF-map "seeding" debug view's three scalars,
 * `bubbleView`'s free .y/.z/.w lanes (io.wesl). Not a channel isolation like
 * `SfMapChannelWeights` — this is the exact composite density
 * `dustParticleCloud.ts`'s S1 CDF sampler consumes, rendered so placement can
 * be judged directly rather than inferred from raw channels. Mirrors
 * `dustParticleCloud.ts`'s density callback in `sfMapPresent.wesl` — change
 * both together. The per-ring means these normalise against ride a SEPARATE
 * storage buffer (`createSfMapOutput.ts`'s `writeRingMeans`), not a lane
 * here — 512 floats has no home in a vec4.
 */

export type SfMapSeedingLanes = {
  /** `render.sfMapSeedingViewWeight`, forced to 0 (view dark) when there is no map or the mean below is 0 — see `createGalaxyModel.ts`'s `sfMapSeedingView` getter. */
  readonly weight: number;
  /** `dust.cloud.dustPlacementCap ?? 0` — the SAME cap (multiples of the sampled texel's OWN ring mean) `dustParticleCloud.ts` clamps its within-ring ratio to; 0 = uncapped. Read live off `currentDust()` so a slider drag updates the view every rebuild, same cadence as `globalMean`. */
  readonly cap: number;
  /** `arrayMean(sfMapRingMeans(map, texel => texel.dust))` — the mean of the map's own per-ring means, the SAME global mean `dustParticleCloud.ts` divides its radial envelope term by. No ambient subtraction: the pedestal is itself structure now, not a floor to clear. */
  readonly globalMean: number;
};
