/**
 * SfMapSeedingLanes — the SF-map "seeding" debug view's three scalars,
 * `bubbleView`'s free .y/.z/.w lanes (io.wesl). Not a channel isolation like
 * `SfMapChannelWeights` — this is the exact composite density
 * `dustParticleCloud.ts`'s S1 CDF sampler consumes, rendered so placement can
 * be judged directly rather than inferred from raw channels.
 */

export type SfMapSeedingLanes = {
  /** `render.sfMapSeedingViewWeight`, forced to 0 (view dark) when there is no map or both means below are 0 — see `createGalaxyModel.ts`'s `sfMapSeedingView` getter. */
  readonly weight: number;
  /** `meanSfMapChannel(map, t => sfMapDustDensity(t.gas, t.oldActivity))` — the SAME mean `dustParticleCloud.ts` normalises its legacy term by. */
  readonly meanLegacy: number;
  /** `meanSfMapChannel(map, sweptDustOvershoot)` — the SAME mean `dustParticleCloud.ts` normalises its swept term by. */
  readonly meanOvershoot: number;
};
