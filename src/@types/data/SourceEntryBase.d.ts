/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of kind.
 * Each variant (`SurveySourceEntry`, `PoiSourceEntry`, ...) intersects with
 * this base and adds its own discriminator (`type: '<kind>'`) plus
 * kind-specific fields.
 */
export type SourceEntryBase = {
  /** Unique readable key — string twin of the numeric `Source` code (e.g. `'sdss'`, `'cluster'`). */
  readonly id: string;
  /** Display name shown in the UI (e.g. `'SDSS'`, `'GLADE'`, `'Cluster'`). */
  readonly label: string;
  /**
   * True if the source covers (approximately) the full celestial sphere.
   * For surveys this is the footprint flag; for POIs it's trivially true
   * (anchors are individual points, not survey patches), so the renderer's
   * coverage-mask logic stays well-behaved across both kinds.
   */
  readonly allSky: boolean;
  /**
   * Whether the source is rendered by default. Drives `ALL_VISIBLE_MASK`
   * (bitwise-OR of every `type: 'survey'` entry whose `visible` is true)
   * and the engine's startup `drawMask`. Users can toggle a survey on or
   * off at runtime — this is purely the default.
   */
  readonly visible: boolean;
};
