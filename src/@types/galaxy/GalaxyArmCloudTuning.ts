/**
 * GalaxyArmCloudTuning — the arm excess's stochastic sprite tier
 * (`armParticleCloud.ts`), nested under `GalaxyArmTuning` the way
 * `GalaxyDustCloudParams` nests under `GalaxyDustParams`.
 */
export type GalaxyArmCloudTuning = {
  /** Off hands `share` back to the ridge chain — the arms' total light is the disc's either way, so this changes the arms' GRAIN, never how much of the disc they borrow. */
  readonly enabled: boolean;
  /**
   * 0..1 share of the arm excess (`pushArmRidges`'s `armExcessFlux`) carried
   * by sprites instead of the ridge chain; the two totals sum to that same
   * excess, so this redistributes brightness rather than adding any (pinned
   * by `galaxyFieldFluxLedger.test.ts`). Placement statistics differ between
   * the two tiers, leaving the cloud somewhat more centrally weighted.
   */
  readonly share: number;
  /**
   * Dimensionless covering factor on a DERIVED count (`deriveArmCloudCount`
   * in `armParticleCloud.ts`: ridge arc length x cross-section width / mean
   * sprite footprint). Only literal at `clumpiness` 0 — above 0 the sampler
   * huddles sprites into complexes that overlap themselves, so the count
   * that actually fills an arm is several times this value.
   */
  readonly coverage: number;
  /**
   * Tilts placement density outward along the arm by `(radius / outermost
   * fadeRadius) ** bias`. BRIGHTNESS-NEUTRAL by construction —
   * `armParticleCloud.ts` divides the same factor back out of each sprite's
   * flux — but only in EXPECTATION: the sampler's bounded rejection can give
   * up at high bias and keep an untilted draw whose flux is still divided,
   * dragging the tier's light inward. Shipped default 2.9 accepts that drift.
   */
  readonly radialBias: number;
  /** 0..1 hierarchical clustering — see `coverage` for what it costs the covering factor, and `GalaxyDustCloudParams.clumpiness` for the same knob on the dust tier. */
  readonly clumpiness: number;
  /** Multiplier on the local-cross-section size draw. */
  readonly sizeScale: number;
  /** sigma_along / sigma_across — how stretched each sprite is along its arm. */
  readonly elongation: number;
};
