/**
 * HiiTextureLanes — the HII tier's tier-global noise-modulation knobs
 * (`GalaxyHiiTuning.textureScale`/`textureContrast`), packed to the field
 * header's `dustDetail.y`/`.z` (`io.wesl`). Shared by every HII group
 * (shells, DIG, associations) — only each component's own `textureWeight`
 * (`GalaxyFieldComponent`, packed to `comps[4i+2].w`) varies per group.
 */
export type HiiTextureLanes = {
  /** Multiplies the noise sample's frequency relative to the dust noise volume's own tile size (`io.wesl`'s `dustNoise.x`) — 1 samples at the SAME scale dust erosion does. */
  readonly scale: number;
  /** Shapes the modulation about its own midpoint, mirroring `dustMap.wesl`'s `dustNoiseMultiplier` contrast exponent. */
  readonly contrast: number;
};
