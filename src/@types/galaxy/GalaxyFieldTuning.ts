/**
 * GalaxyFieldTuning — live-tunable knobs for the analytic field's disc
 * (`discEnabled`, which also gates the warped outer disc's ring patches —
 * see `pushWarpedOuterDisc` in `galaxyFieldMixture.ts`, not independently
 * tunable) and spiral-arm ridge blobs (`pushArmRidges`). Optional on
 * `buildGalaxyFieldMixture`; omitted, the mixture reproduces today's fixed
 * constants exactly (see `DEFAULT_GALAXY_FIELD_TUNING`).
 */
import type { GalaxySfMapParams } from './GalaxySfMapParams';

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
   * The arm excess's exponential scale length in units of the disc's own —
   * 1 holds the arm/interarm contrast `armContrast` constant with radius,
   * above 1 lets it grow outward. Governs BOTH arm tiers, so it is the
   * radial profile of the arms as such, not of one tier. See
   * `armExcessSurfaceShape` for the pivot and for what is and isn't measured
   * about the value.
   */
  readonly armExcessScaleRatio: number;
  /**
   * Debug knob: divides all three of an arm blob's sigmas, holding its flux,
   * so the ridge breaks into countable oriented blobs. 1 is the real field.
   */
  readonly armBlobSharpness: number;
  /**
   * Master toggle for the arm particle-cloud tier (`armParticleCloud.ts`) —
   * same role `dustEnabled` plays for the dust cloud. Off skips the sprites
   * and their component-budget reservation, and hands `armCloudShare` back to
   * the ridge chain: the arms' total light is the disc's either way, so this
   * changes the arms' GRAIN, never how much of the disc they borrow.
   */
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
  /** Master toggle for the whole analytic dust tier's shader loop (the particle cloud — see `GalaxyDustCloudParams`). */
  readonly dustEnabled: boolean;
  /** Master toggle for the HII-region tier (`hiiRegions.ts`) — off skips the sprites, their cavities and their component-budget reservation. */
  readonly hiiEnabled: boolean;
  /**
   * Whole-tier flux multiplier. Unlike `armCloudShare` this ADDS light: F98
   * masked young features out of its fit, so HII emission was never inside
   * the disc mixture and owes it no debit. 1 is the calibrated default.
   */
  readonly hiiBrightness: number;
  /** Multiplies the Strömgren radius from `hiiRadiusUnits`; 1 is that law exactly. */
  readonly hiiRadiusScale: number;
  /** Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front. */
  readonly hiiShellThickness: number;
  /** 0..1 brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell. */
  readonly hiiClusterStrength: number;
  /**
   * Radius of the dust cavity a young event carves, as a fraction of its
   * HII radius. 0 leaves the dust undisturbed, which makes the glow read as
   * a smudge behind a curtain rather than a hole with a lit wall.
   */
  readonly hiiCavityScale: number;
  /** The SSPSF automaton that grows the ISM structure the dust tier is seeded from. */
  readonly sfMap: GalaxySfMapParams;
  /**
   * Gate for the dust particle cloud reading the automaton's output. ON
   * makes the sampled map the cloud's ONLY placement density (`gas *
   * oldActivity` — see `sfMapDustDensity`), replacing the analytic
   * arm-lane/smooth-disc roll entirely, and still elongates each splat
   * along the measured crest orientation. OFF leaves `buildDustParticleCloud`
   * byte-identical to before the map existed.
   *
   * Defaults ON, which is inert wherever no automaton runs: both consumers
   * need a sampled map handed in and fall back to the unseeded analytic path
   * without one, so this only takes effect where a map is actually produced.
   */
  readonly sfMapDustSeeding: boolean;
};
