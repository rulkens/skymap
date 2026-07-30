/**
 * Fields shared by every row of the SOURCE_REGISTRY, regardless of kind.
 * Each variant (`GalaxyCatalogSourceEntry`, `StructureSourceEntry`, ...) intersects with
 * this base and adds its own discriminator (`type: '<kind>'`) plus
 * kind-specific fields.
 */
import type { CategoryLabelLayer } from '../animation/CategoryLabelLayer';

export type SourceEntryBase = {
  /** Unique readable key — string twin of the numeric `Source` code (e.g. `'sdss'`, `'cluster'`). */
  readonly id: string;
  /** Display name shown in the UI (e.g. `'SDSS'`, `'GLADE'`, `'Cluster'`). */
  readonly label: string;
  /**
   * True if the source covers (approximately) the full celestial sphere.
   * For galaxy catalogs this is the footprint flag; for structures it's trivially true
   * (anchors are individual points, not galaxy catalog patches), so the renderer's
   * coverage-mask logic stays well-behaved across both kinds.
   */
  readonly allSky: boolean;
  /**
   * Whether the source is rendered by default. Drives `ALL_VISIBLE_MASK`
   * (bitwise-OR of every `type: 'galaxyCatalog'` entry whose `visible` is true)
   * and the engine's startup `drawMask`. Users can toggle a galaxy catalog on or
   * off at runtime — this is purely the default.
   */
  readonly visible: boolean;
  /**
   * True if this source carries toggleable on-screen text labels.
   * Drives the label-visibility record and the fade-layer routing in the
   * label subsystem. Bulk galaxy catalogs (sdss, glade, 2mrs, milliquas,
   * desiDeep, synthetic) and the survey-wide Gaia bin are false: they render
   * millions of points and no names.
   *
   * This is a CAPABILITY, not a routing detail — a source that puts a name on
   * screen sets it, whichever renderer draws that name. The near-field bodies
   * and the curated star map caption through `foregroundLabelsLayer` on the
   * NEAR0 slab rather than the COSMO label director, and they set the flag all
   * the same; `labelLayer` is where that routing difference is expressed.
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
   * See `LabelLayerId` for the layer set. Absent on non-label-bearing rows.
   */
  readonly labelLayer?: CategoryLabelLayer;
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
