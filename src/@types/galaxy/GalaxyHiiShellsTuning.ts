/**
 * GalaxyHiiShellsTuning — the emission-shell tier's own tunable knobs
 * (`hiiRegions.ts`'s per-region shell + embedded-OB-cluster sprites), nested
 * under `GalaxyHiiTuning` the way `GalaxyHiiDigTuning`/`GalaxyYoungStarsTuning`
 * nest their own tiers.
 */
export type GalaxyHiiShellsTuning = {
  readonly enabled: boolean;
  /**
   * This tier's own flux GAIN, multiplied against `GalaxyHiiTuning.brightness`
   * (the whole-field master) — 1 leaves the shell tier at whatever the master
   * alone would give it, the same per-tier-gain role
   * `GalaxyYoungStarsTuning.brightness` plays for its own tier.
   */
  readonly brightness: number;
  /**
   * Multiplies each region's Strömgren radius — R_s ~ L^(1/3) off the same
   * Kennicutt luminosity draw that sets its brightness, anchored at 10 pc for
   * the faintest (`hiiRadiusUnits`). 1 is that law exactly.
   */
  readonly radiusScale: number;
  /** Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front. */
  readonly shellThickness: number;
  /** 0..1 brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell. */
  readonly clusterStrength: number;
  /**
   * Radius of the dust cavity a young event carves, as a fraction of its
   * HII radius. 0 leaves the dust undisturbed, which makes the glow read as
   * a smudge behind a curtain rather than a hole with a lit wall.
   */
  readonly cavityScale: number;
  /**
   * 0..1+ how strongly the shell + embedded-cluster sprites are modulated by
   * the tier-global noise texture (`splat.wesl`'s `hiiNoiseTerm`, the same
   * baked volume the dust cloud erodes with) — breaks up their circular
   * Gaussian footprint. 0 (untouched) is NOT the default here; see
   * `DEFAULT_GALAXY_FIELD_TUNING`.
   */
  readonly texture: number;
  /**
   * Multiplies the noise sample's frequency relative to the dust noise
   * volume's own tile size (`io.wesl`'s `dustNoise.x`) — 1 samples at the
   * SAME scale dust erosion does. Feeds the whole HII texture lane
   * (`createGalaxyModel.ts`'s `hiiTexture`) shared by every group even
   * though it's stored here; only each group's own `texture` weight varies.
   */
  readonly textureScale: number;
  /**
   * Shapes the noise modulation about its own midpoint, mirroring
   * `dustMap.wesl`'s `dustNoiseMultiplier` contrast exponent. Same
   * whole-tier-shared scope as `textureScale`.
   */
  readonly textureContrast: number;
};
