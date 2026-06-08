/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of kind.
 * Each variant (`SurveySourceEntry`, `StructureSourceEntry`, ...) intersects with
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
   * For surveys this is the footprint flag; for structures it's trivially true
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
  /**
   * True if this source carries toggleable on-screen text labels.
   * Drives the label-visibility record and the fade-layer routing in the
   * label subsystem. The two real label sets are:
   *   - galaxyNames layer: famousGalaxy
   *   - structure layer:   cluster, supercluster, void, group
   * All bulk surveys (sdss, glade, 2mrs, milliquas, synthetic) are false.
   */
  readonly bearsLabel: boolean;
  /**
   * True if this source carries a ring/halo marker around its anchor point.
   * Today this is exactly the structure category set (cluster, supercluster,
   * void, group). famousGalaxy has no ring — only a name label — so the
   * marker-visibility record excludes it entirely.
   */
  readonly bearsMarker: boolean;
  /**
   * Which fade layer this source's labels live on. Present iff bearsLabel.
   *   - 'galaxyNames' — the shared galaxy-name layer (famousGalaxy rows)
   *   - 'structure'   — the per-structure-category label layer
   * Absent on non-label-bearing rows (bearsLabel === false).
   */
  readonly labelLayer?: 'galaxyNames' | 'structure';
  /**
   * Long-form label for detail surfaces (e.g. 'Galaxy Cluster', 'Famous Galaxy').
   * Present iff bearsLabel.
   */
  readonly detailLabel?: string;
  /**
   * Compact label for chips and previews (e.g. 'Cluster', 'Galaxy').
   * Present iff bearsLabel. The existing `label` field carries the shortest
   * UI name ('Cluster', 'Famous') — shortLabel is the one step longer form
   * the InfoCard chips use.
   */
  readonly shortLabel?: string;
  /**
   * Plural label for list and toggle headers (e.g. 'Clusters', 'Famous Galaxies').
   * Present iff bearsLabel.
   */
  readonly plural?: string;
};
