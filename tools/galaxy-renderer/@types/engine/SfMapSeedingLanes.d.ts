/**
 * SfMapSeedingLanes — the SF-map "seeding" debug view's two scalars,
 * `bubbleView`'s free .y/.w lanes (io.wesl — .z sits between them, spare).
 * Not a channel isolation like `SfMapChannelWeights` — this is the exact
 * composite density `dustParticleCloud.ts`'s S1 CDF sampler consumes,
 * rendered so placement can be judged directly rather than inferred from raw
 * channels.
 */

export type SfMapSeedingLanes = {
  /** `render.sfMapSeedingViewWeight`, forced to 0 (view dark) when there is no map or the mean below is 0 — see `createGalaxyModel.ts`'s `sfMapSeedingView` getter. */
  readonly weight: number;
  /** `meanSfMapChannel(map, sweptDustOvershoot)` — the SAME mean `dustParticleCloud.ts` normalises its placement density by. */
  readonly meanOvershoot: number;
};
