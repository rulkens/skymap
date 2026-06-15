/**
 * StructureInfo — one extended structure (cluster / supercluster / void /
 * group) as a resolved focusable target, parallel to `GalaxyInfo` (and the
 * Milky Way's `MilkyWayInfo`).  That the structure info is the stored record
 * while galaxy info is derived on-demand is a provenance detail — as targets
 * they are peers, and both flow through the same hover / select / focus slots.
 *
 * The single source of truth for a structure record.  Famous galaxies are
 * galaxy data, not structures, so they are deliberately absent here.
 *
 * ### Why a discriminated union on `category`
 *
 * Clusters alone carry an Abell/ACO designation.  Modelling the record as a
 * flat shape with `abell?` optional would let a supercluster, void, or group
 * literal silently carry one.  Splitting on `category` (`StructureCategory`)
 * makes `abell` exist only on the cluster arm — consumers must narrow on
 * `category` before reading it, and a producer can't build a void or group
 * with an Abell number.  The shared structure fields live on `StructureBase`
 * so the four arms stay in lockstep.
 */

import type { Vec3 } from '../../math/Vec3';

/**
 * Fields every structure record carries regardless of category.  Two distinct
 * axes live here: `type` is the focusable-union tag (the parallel of a galaxy's
 * `'galaxyCatalog'` tag) and is the same for every arm; `category` is the
 * structure sub-kind (cluster / supercluster / void / group, the parallel of a
 * `GalaxyCatalogId`) and is added per-arm below so each arm's literal pins a
 * single discriminant.
 */
type StructureBase = {
  /** Union discriminant — mirrors SOURCE_REGISTRY's 'structure' type. */
  readonly type: 'structure';
  readonly id: string;
  readonly name: string;
  readonly worldPos: Vec3;
  /**
   * Whether this structure is a hand-curated "featured" anchor.  Gates label
   * rendering (only featured structures get labels) and deep-link
   * eligibility.  Bulk catalog records set false; curated anchors set true.
   */
  readonly featured: boolean;
  /**
   * Human-readable blurb shown in the expanded info card.  Curated lead
   * paragraph for featured anchors; auto-generated one-liner for bulk
   * catalog entries.  Optional — the card renders no description rather than
   * empty chrome when absent.
   */
  readonly description?: string;
  /**
   * Normalized significance in [0,1] driving ring brightness / size weight.
   * Normalized M500 for clusters, normalized Nm for superclusters; featured
   * anchors default to 1.  Optional — falls back to full weight at render.
   */
  readonly significance?: number;
  /**
   * Physical CORE radius in Mpc — virial / R_200 for clusters,
   * characteristic scale for superclusters and voids.  Drives the
   * camera-focus tween distance and the InfoCard's "r {value}" line.
   * Required — every structure producer sets it.
   */
  readonly physicalRadiusMpc: number;
  /**
   * Apparent / named-extent radius in Mpc — the wider visual/membership
   * boundary.  Typically 2-3× `physicalRadiusMpc` for clusters; equal to it
   * for superclusters and voids.  Drives the on-screen ring + halo extent,
   * the label's close-approach fade, and the galaxy-membership cone search.
   * Optional — the render falls back to `physicalRadiusMpc` when absent.
   */
  readonly apparentRadiusMpc?: number;
};

/** A galaxy cluster.  Clusters alone carry an Abell/ACO designation. */
type ClusterRecord = StructureBase & {
  readonly category: 'cluster';
  /**
   * Abell/ACO catalog designation where known (e.g. 'A1656' for Coma),
   * surfaced for the InfoCard.  Omitted when the cluster has no Abell number
   * (e.g. Virgo).  Lives on the cluster arm only — superclusters and voids
   * never have one.
   */
  readonly abell?: string;
};

/** A supercluster — an extended structure with no Abell designation. */
type SuperclusterRecord = StructureBase & {
  readonly category: 'supercluster';
};

/** A cosmic void — an extended structure with no Abell designation. */
type VoidRecord = StructureBase & {
  readonly category: 'void';
};

/**
 * A nearby galaxy group — a seed-only featured structure with no Abell
 * designation.  Groups (Local Group, M81 Group, Cen A Group, …) are
 * hand-curated anchors rather than catalog-derived; they carry only the
 * shared `StructureBase` fields, just like voids.
 */
type GroupRecord = StructureBase & {
  readonly category: 'group';
};

/**
 * An extended structure record.  `category` is a `StructureCategory`
 * (cluster / supercluster / void / group); famous galaxies are not
 * structures and are absent from this union.
 */
export type StructureInfo = ClusterRecord | SuperclusterRecord | VoidRecord | GroupRecord;
