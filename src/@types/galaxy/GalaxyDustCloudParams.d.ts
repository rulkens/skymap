/**
 * GalaxyDustCloudParams — the structured 3D dust particle cloud: thousands
 * of small anisotropic Gaussians standing in for individual GMC/cloud
 * complexes, giving the dust field actual volumetric depth. This is the
 * galaxy's ONLY dust tier (see `galaxyDustMixture.ts`), carrying the
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
   * S4 strength — how strongly the ISM map's detail ratio (map density over
   * its 8-texel blur) modulates each cloud's column at accumulation
   * (dustMap.wesl via the header's dustDetail lane). 0 disables the whole
   * path (the shader skips it), 1 = full ratio, up to 2 extrapolates.
   */
  readonly mapDetail: number;
  /**
   * Caps the map-seeded placement CDF's WITHIN-RING ratio (`dust /
   * ringMean[ring]`, dustParticleCloud.ts), in multiples of the texel's own
   * ring mean; 0 disables it. The ONLY placement-tempering knob: a runaway
   * texel (a blazing rim pixel) starves the rest of its ring of placement
   * mass, so capping clips just that texel. Deliberately RING-relative, not
   * map-global — the radial dust profile is a separate, structural envelope
   * term this cap never touches. The ISM-map "seeding" debug view
   * (ismMapPresent.wesl) applies the same cap so it never drifts from placement.
   */
  readonly dustPlacementCap: number;
  /**
   * S5 silhouette-carving depth: turns the cloud's smooth Gaussian envelope
   * into a sharp fractal-coastline edge (dustMap.wesl's `dustCarveMask`),
   * rather than eroding only its interior the way `texture` does. 0 is the
   * MANDATORY identity — the shader branches out entirely, since the mask's
   * `smoothstep` would reshape the profile even near 0. UNLIKE `texture`,
   * carving REMOVES mass, so the tau slider compensates as this rises.
   */
  readonly carve: number;
  /** Shapes the carve mask's smoothstep window: 0 is wide/soft, 1 is narrow/hard. Read only when `carve > 0`. */
  readonly carveSharpness: number;
  /**
   * Elongates the noise field `carve` (and `texture`, which shares the same
   * band-limited sample) reads along the disc's local azimuthal direction at
   * each splat (dustMap.wesl's `stretchNoiseCoord`). 1 is isotropic; >1
   * stretches features along rotation.
   */
  readonly carveStretch: number;
};
