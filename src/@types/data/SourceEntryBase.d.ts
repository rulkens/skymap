/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of kind.
 * Each variant (`SurveySourceEntry`, `PoiSourceEntry`, ...) intersects with
 * this base and adds its own discriminator (`type: '<kind>'`) plus
 * kind-specific fields.
 */
export type SourceEntryBase = {
  /** Display name shown in the UI (e.g. `'SDSS'`, `'GLADE'`, `'Cluster'`). */
  readonly label: string;
  /**
   * True if the source covers (approximately) the full celestial sphere.
   * For surveys this is the footprint flag; for POIs it's trivially true
   * (anchors are individual points, not survey patches), so the renderer's
   * coverage-mask logic stays well-behaved across both kinds.
   */
  readonly allSky: boolean;
};
