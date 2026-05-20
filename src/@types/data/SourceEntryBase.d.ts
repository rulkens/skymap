/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of whether
 * it's a survey or a POI. Survey- and POI-specific fields live in
 * `SurveyEntry` and `PoiEntry` respectively, which intersect with this base.
 */
export type SourceEntryBase = {
  /** Discriminator — `'survey'` for SurveyEntry, `'poi'` for PoiEntry. */
  readonly type: 'survey' | 'poi';
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
