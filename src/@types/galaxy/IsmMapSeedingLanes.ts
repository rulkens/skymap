/**
 * IsmMapSeedingLanes — the ISM-map "seeding" debug view's three scalars,
 * `bubbleView`'s free .y/.z/.w lanes (io.wesl). Not a channel isolation like
 * `IsmMapChannelWeights`: this is the exact composite density
 * `dustParticleCloud.ts`'s S1 CDF sampler consumes, rendered so placement can
 * be judged directly. Mirrors `dustParticleCloud.ts`'s density callback in
 * `ismMapPresent.wesl` — change both together. Per-ring means ride a
 * SEPARATE storage buffer (`createIsmMapOutput.ts`'s `writeRingMeans`); 512
 * floats has no home in a vec4.
 */

export type IsmMapSeedingLanes = {
  /** `render.ismMapSeedingViewWeight`, forced to 0 (view dark) when there is no map or the mean below is 0 — see `createGalaxyModel.ts`'s `ismMapSeedingView` getter. */
  readonly weight: number;
  /** `dust.cloud.dustPlacementCap ?? 0` — the SAME cap (multiples of the sampled texel's OWN ring mean) `dustParticleCloud.ts` clamps its within-ring ratio to; 0 = uncapped. Read live off `currentDust()` so a slider drag updates the view every rebuild, same cadence as `globalMean`. */
  readonly cap: number;
  /** `arrayMean(ismMapRingMeans(map, texel => texel.dust))` — the mean of the map's own per-ring means, the SAME global mean `dustParticleCloud.ts` divides its radial envelope term by. No ambient subtraction: the pedestal is itself structure now, not a floor to clear. */
  readonly globalMean: number;
};
