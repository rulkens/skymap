/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of whether
 * it's a survey or a POI. Survey- and POI-specific fields live in
 * `SurveySourceEntry` and `PoiSourceEntry` respectively, which intersect
 * with this base.
 */
export type SourceEntryBase = {
  /** Discriminator — `'survey'` for SurveySourceEntry, `'poi'` for PoiSourceEntry. */
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
