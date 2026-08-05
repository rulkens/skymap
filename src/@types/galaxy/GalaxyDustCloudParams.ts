/**
 * GalaxyDustCloudParams — the structured 3D dust particle cloud: thousands
 * of small anisotropic Gaussians standing in for individual GMC/cloud
 * complexes, giving the dust field actual volumetric depth. This is the
 * galaxy's ONLY dust tier — the smooth analytic lane it used to be layered
 * on was deleted (`galaxyDustMixture.ts`'s header) — so it carries the
 * galaxy's FULL measured `tau`. See `dustParticleCloud.ts` for the
 * size/mass/placement model. Refiners are ×measured-default scalers where
 * 1.0 reproduces the literature value.
 */
export type GalaxyDustCloudParams = {
  /** Particle budget. 0 disables the cloud entirely. */
  readonly count: number;
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
  /** 0..1+ ridged-noise erosion strength multiplying the cloud tier's tau (dustNoiseBake.wesl, dustMap.wesl). 0 = smooth analytic ellipsoids. */
  readonly texture: number;
  /** Multiplier on the noise volume's world-space tile size (dustParticleCloud.ts's DUST_NOISE_TILE_PC). */
  readonly textureScale: number;
  /** Shapes the erosion noise about its own midpoint — 1 = identity, higher = harder filament edges (dustMap.wesl's `dustNoiseMultiplier`). */
  readonly textureContrast: number;
  /**
   * S4 strength — how strongly the SF map's detail ratio (map density over
   * its 8-texel blur) modulates each cloud's column at accumulation
   * (dustMap.wesl via the header's dustDetail lane). 0 disables the whole
   * path (the shader skips it), 1 = full ratio, up to 2 extrapolates.
   */
  readonly mapDetail: number;
};
