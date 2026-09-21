/**
 * FieldDustCarve — S5's silhouette-carving lanes (io.wesl's `dustCarve`,
 * dustMap.wesl's `dustCarveMask`/`stretchNoiseCoord`). Cached the same
 * cadence as `FieldDustNoise` — only changes when the dust params or
 * geometry do, not every `drawFrame`.
 */
export type FieldDustCarve = {
  /**
   * Carve depth. 0 is the MANDATORY identity — dustMap.wesl branches out of
   * the whole feature rather than let the smoothstep alone reshape the
   * silhouette. Removes mass as it rises, unlike `FieldDustNoise.amplitude`'s
   * mean-1 interior erosion (`GalaxyDustCloudParams.carve`'s own doc).
   */
  readonly carve: number;
  /** 0..1: narrows the carve smoothstep window toward a hard, defined edge at 1; widens it toward a soft one at 0. */
  readonly sharpness: number;
  /** >= 1: elongates the shared noise field along the disc's local azimuthal direction (`dustMap.wesl`'s `stretchNoiseCoord`) — stage 1 of wisp anisotropy. 1 is isotropic (identity). */
  readonly stretch: number;
};
