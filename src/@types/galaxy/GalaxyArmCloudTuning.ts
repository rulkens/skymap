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
   * by stochastic emission sprites instead of the deterministic ridge chain.
   * The two rendered totals sum to that same excess, so this redistributes
   * brightness rather than adding any (pinned by
   * `galaxyFieldFluxLedger.test.ts`).
   *
   * Both tiers shape their light by the same `armExcessSurfaceShape`, so the
   * arms' radial LAW does not move with the share — but their placement
   * statistics differ (per-sprite flux tracks the local arm width, sprite
   * density does not), leaving the cloud somewhat more centrally weighted than
   * the ridge: 0 -> 1 pulls the arms' flux-weighted mean radius in by ~6% on
   * the Milky Way preset, ~13% on m100.
   */
  readonly share: number;
  /**
   * Dimensionless covering factor on a DERIVED count: the sprite count comes
   * from arm geometry (ridge arc length x local cross-section width, divided by
   * the mean sprite footprint — `deriveArmCloudCount` in
   * `armParticleCloud.ts`), so pitch, arm width, arm length and arm count all
   * move it without a re-tune. 1 = one sprite-footprint of coverage per unit
   * arm area on average.
   *
   * That covering factor is only literal at `clumpiness` 0: the placement
   * sampler huddles `1 + 15*clumpiness` sprites into one complex, so above 0
   * the derived count overlaps itself instead of tiling the arm and the setting
   * that actually FILLS an arm is several times higher. `radialBias` is not in
   * the derivation either, so raising it over-covers the outer arm and
   * under-covers the inner one at a fixed coverage.
   */
  readonly coverage: number;
  /**
   * Tilts the sprites outward along the arm: the placement density gains a
   * `(radius / outermost fadeRadius) ** bias` factor. At 0 the placement is
   * pure coverage demand, which puts ~80% of the sprites inside the arm's inner
   * half, where they are small, crowded and lost under the bulge anyway.
   *
   * BRIGHTNESS-NEUTRAL by construction — `armParticleCloud.ts` divides the same
   * factor back out of each sprite's flux, so the tilt moves the cloud's GRAIN,
   * not its light. The cancellation is exact in EXPECTATION only: one
   * realization's flux-weighted mean radius scatters ~3%, and high bias breaks
   * it outright — the sampler's bounded rejection gives up and keeps an
   * untilted draw whose flux is still divided by the inner tilt, which at bias
   * 3 is 17% of complexes and drags the tier's light ~4% inward. The shipped
   * default sits at 2.9, so those figures describe it rather than bound it:
   * the drift is accepted, not avoided.
   */
  readonly radialBias: number;
  /** 0..1 hierarchical clustering — see `coverage` for what it costs the covering factor, and `GalaxyDustCloudParams.clumpiness` for the same knob on the dust tier. */
  readonly clumpiness: number;
  /** Multiplier on the local-cross-section size draw. */
  readonly sizeScale: number;
  /** sigma_along / sigma_across — how stretched each sprite is along its arm. */
  readonly elongation: number;
};
