export type TerrainPickMarkerSettings = {
  enabled: boolean;
  /**
   * The sphere's radius in WORLD metres: the gauge the user reads the CPU-floor/GPU-surface
   * height gap against, so a physical size the user sets, never a screen-pixel one.
   */
  radiusM: number;
};
