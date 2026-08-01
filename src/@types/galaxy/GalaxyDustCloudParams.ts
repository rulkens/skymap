/**
 * GalaxyDustCloudParams — the structured 3D dust particle cloud layered
 * under the flat dust-feature tier: thousands of small anisotropic
 * Gaussians standing in for individual GMC/cloud complexes, giving the dust
 * field actual volumetric depth instead of plane-crossing quads.
 * See `dustParticleCloud.ts` for the size/mass/placement model.
 */
export type GalaxyDustCloudParams = {
  /** Particle budget. 0 disables the cloud entirely. */
  readonly count: number;
  /** 0..1 share of the galaxy's total tau carried by particles rather than the smooth field + flat features. */
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
};
