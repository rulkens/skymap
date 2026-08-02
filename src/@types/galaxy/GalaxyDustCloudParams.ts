/**
 * GalaxyDustCloudParams — the structured 3D dust particle cloud layered on
 * the smooth analytic dust lane: thousands of small anisotropic Gaussians
 * standing in for individual GMC/cloud complexes, giving the dust field
 * actual volumetric depth. See `dustParticleCloud.ts` for the
 * size/mass/placement model.
 *
 * The arm-lane group at the end (`armContrast` onward) describes the lane
 * the particles are SEEDED on rather than the particles themselves; they
 * live here because the cloud is their only client. Refiners are
 * ×measured-default scalers where 1.0 reproduces the literature value.
 */
export type GalaxyDustCloudParams = {
  /** Particle budget. 0 disables the cloud entirely. */
  readonly count: number;
  /** 0..1 share of the galaxy's total tau carried by particles rather than the smooth field. */
  readonly share: number;
  /** 0..1 share of particles seeded on the arm dust lanes; the rest follow the smooth disc profile. */
  readonly armBias: number;
  /** 0..1 hierarchical clustering: 0 = every particle independent, 1 = ~16 children per cloud complex. */
  readonly clumpiness: number;
  /** Multiplier on the physical cloud-size range (GMC size function). */
  readonly sizeScale: number;
  /** Parsecs; floors the GMC size sampler (dustParticleCloud.ts's SIZE_MIN_PC). */
  readonly sizeFloorPc: number;
  /** sigma_along / sigma_across — how far clouds are sheared along the local flow. */
  readonly elongation: number;
  /** Particle-centre vertical scatter as a fraction of the dust layer's own sigma_z. Clouds sit in a THINNER layer than the mean dust. */
  readonly heightRatio: number;
  /** 0..1 probability that a particle inside an SF bubble is swept out to its rim. */
  readonly bubbleCarve: number;
  /** 0..1+ ridged-noise erosion strength multiplying the cloud tier's tau (dustNoiseBake.wesl, dustMap.wesl). 0 = smooth analytic ellipsoids. */
  readonly texture: number;
  /** Multiplier on the noise volume's world-space tile size (dustParticleCloud.ts's DUST_NOISE_TILE_PC). */
  readonly textureScale: number;
  /** Shapes the erosion noise about its own midpoint — 1 = identity, higher = harder filament edges (dustMap.wesl's `dustNoiseMultiplier`). */
  readonly textureContrast: number;
  /** Molecular arm/interarm contrast (measured ~2–5); deliberately larger than the stellar K≈1.3. */
  readonly armContrast: number;
  /** Star-formation event rate scale; drives the bubble catalog now, HII knots later. */
  readonly sfActivity: number;
  readonly laneWidth: number;
  /** Density-wave shock displacement from the stellar ridge. */
  readonly laneOffset: number;
  readonly bubbleScale: number;
  /**
   * SF-map seeded placement density blend (only read while
   * `GalaxyFieldTuning.sfMapDustSeeding` is on): 0 = pure gas channel, 1 =
   * `gas * recentSf`, which peaks at the leading edge of an active front —
   * where real dust lanes sit relative to HII regions, not at `recentSf`'s
   * own peak (the just-swept cavity).
   */
  readonly sfMapSfWeight: number;
};
