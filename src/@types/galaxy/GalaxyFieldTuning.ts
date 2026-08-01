/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field's disc
 * (`discEnabled`, which also gates the warped outer disc's ring patches —
 * see `pushWarpedOuterDisc` in `galaxyFieldMixture.ts`, not independently
 * tunable) and spiral-arm ridge blobs (`pushArmRidges`). Optional on
 * `buildGalaxyFieldMixture`; omitted, the mixture reproduces today's fixed
 * constants exactly (see `DEFAULT_GALAXY_FIELD_TUNING`).
 */
export type GalaxyFieldTuning = {
  /**
   * Master toggle for the 8 unconditional base pushes (inner disc, bulge,
   * bar, halo) AND the warped outer disc's ring patches — one pill for the
   * whole smooth field, warp support included.
   */
  readonly discEnabled: boolean;
  /** Master toggle for `pushArmRidges`, mirrored to the section header checkbox. */
  readonly armsEnabled: boolean;
  /** Multiplies Reid et al. 2019's measured maser-arm width law; 1 is that law exactly. */
  readonly armWidthScale: number;
  /**
   * K: the arm/interarm surface-brightness ratio in old stellar light.
   * Drives `pushArmRidges`' contrast law, scaled per arm by that arm's own
   * `age`. 1.3 is the Milky Way's measured value (Drimmel & Spergel 2001).
   */
  readonly armContrast: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly armBlobSharpness: number;
  /** Master toggle for the arm particle-cloud tier (`armParticleCloud.ts`) — same role `dustEnabled` plays for the dust cloud. Off skips both the sprites and their component-budget reservation. */
  readonly armCloudEnabled: boolean;
  /**
   * 0..1 share of the arm excess (`pushArmRidges`'s `armExcessFlux`) carried
   * by stochastic emission sprites (`armParticleCloud.ts`) instead of the
   * deterministic ridge chain — the two totals still sum to the same excess,
   * so this redistributes brightness rather than adding any.
   */
  readonly armCloudShare: number;
  /**
   * Dimensionless covering factor for the arm particle cloud: the sprite
   * COUNT is not a knob here — it is derived from arm geometry (ridge arc
   * length x local cross-section width, divided by mean sprite footprint;
   * see `deriveArmCloudCount` in `armParticleCloud.ts`) — so pitch, arm
   * width, arm length and arm count all move it without a re-tune. This
   * multiplies that derived count. 1 = one sprite-footprint of coverage per
   * unit arm area on average (sprites still overlap/gap stochastically).
   */
  readonly armCloudCoverage: number;
  /**
   * Tilts the arm cloud's sprites outward along the arm: the placement
   * density gains a `(radius / outermost fadeRadius) ** bias` factor, so 0
   * is pure coverage-demand placement and larger values starve the inner
   * arm, where sprites are small, crowded, and lost under the bulge anyway.
   *
   * BRIGHTNESS-NEUTRAL by construction — `armParticleCloud.ts` divides the
   * same factor back out of each sprite's flux, so the tier's radial light
   * profile is invariant to this knob. It moves where the cloud's GRAIN is,
   * not where its light is; the extra outer sprites split the outer arm's
   * existing flux rather than adding any, which is what keeps them dim.
   */
  readonly armCloudRadialBias: number;
  /** 0..1 hierarchical clustering for the arm particle cloud — see `GalaxyDustCloudParams.clumpiness` for the same knob on the dust tier. */
  readonly armCloudClumpiness: number;
  /** Multiplier on the arm particle cloud's local-cross-section size draw. */
  readonly armCloudSizeScale: number;
  /** sigma_along / sigma_across for the arm particle cloud — how stretched each sprite is along its arm. */
  readonly armCloudElongation: number;
  /** Master toggle for the analytic dust lane's shader loop. */
  readonly dustEnabled: boolean;
};
