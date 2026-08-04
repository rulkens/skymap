/**
 * GalaxyArmCloudTuning — the arm excess's stochastic sprite tier
 * (`armParticleCloud.ts`), nested under `GalaxyArmTuning` the way
 * `GalaxyDustCloudParams` nests under `GalaxyDustParams`.
 */
export type GalaxyArmCloudTuning = {
  /**
   * Master toggle for the tier — the same role `GalaxyDustTuning.enabled`
   * plays for the dust cloud. Off skips the sprites and their
   * component-budget reservation, and hands `share` back to the ridge chain:
   * the arms' total light is the disc's either way, so this changes the arms'
   * GRAIN, never how much of the disc they borrow.
   */
  readonly enabled: boolean;
  /**
   * 0..1 share of the arm excess (`pushArmRidges`'s `armExcessFlux`) carried
   * by stochastic emission sprites instead of the deterministic ridge chain —
   * the two totals still sum to the same excess, so this redistributes
   * brightness rather than adding any.
   */
  readonly share: number;
  /**
   * Dimensionless covering factor: the sprite COUNT is not a knob here — it is
   * derived from arm geometry (ridge arc length x local cross-section width,
   * divided by mean sprite footprint; see `deriveArmCloudCount` in
   * `armParticleCloud.ts`) — so pitch, arm width, arm length and arm count all
   * move it without a re-tune. This multiplies that derived count. 1 = one
   * sprite-footprint of coverage per unit arm area on average (sprites still
   * overlap/gap stochastically).
   */
  readonly coverage: number;
  /**
   * Tilts the sprites outward along the arm: the placement density gains a
   * `(radius / outermost fadeRadius) ** bias` factor, so 0 is pure
   * coverage-demand placement and larger values starve the inner arm, where
   * sprites are small, crowded, and lost under the bulge anyway.
   *
   * BRIGHTNESS-NEUTRAL by construction — `armParticleCloud.ts` divides the
   * same factor back out of each sprite's flux, so the tier's radial light
   * profile is invariant to this knob. It moves where the cloud's GRAIN is,
   * not where its light is; the extra outer sprites split the outer arm's
   * existing flux rather than adding any, which is what keeps them dim.
   */
  readonly radialBias: number;
  /** 0..1 hierarchical clustering — see `GalaxyDustCloudParams.clumpiness` for the same knob on the dust tier. */
  readonly clumpiness: number;
  /** Multiplier on the local-cross-section size draw. */
  readonly sizeScale: number;
  /** sigma_along / sigma_across — how stretched each sprite is along its arm. */
  readonly elongation: number;
};
