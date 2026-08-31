/**
 * FieldDustNoise — the dust-noise erosion lane (io.wesl's `dustNoise`). Unlike
 * the camera/exposure lanes these are cached in `createGalaxyModel.ts`'s
 * `rebuildDustMixture` — they only change when the dust params or geometry do,
 * not every `drawFrame`.
 */

export type FieldDustNoise = {
  /** World units spanned by one full wrap of the baked noise volume (dustParticleCloud.ts's `dustNoiseTileUnits`). */
  readonly tileUnits: number;
  /** Erosion strength — 0 disables the multiplier and the shader branches out entirely (`GalaxyDustCloudParams.texture`). */
  readonly amplitude: number;
  /** Index WITHIN the dust slice (relative to `dustOffset`) where the particle-cloud components start. Always 0 — the particle cloud IS the dust slice, not a lane within it, so there is no offset to skip. */
  readonly cloudOffset: number;
  /** Signed-power exponent shaping the noise about its midpoint (dustMap.wesl's `dustNoiseMultiplier`) — `1 / GalaxyDustCloudParams.textureContrast`, inverted here so a higher slider value hardens filament edges. */
  readonly contrastExp: number;
};
