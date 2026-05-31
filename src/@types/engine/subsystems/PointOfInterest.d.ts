/**
 * PointOfInterest — a named point in the volume rendered as a label and,
 * for extended structures, a ring/halo marker.
 *
 * ### Why a discriminated union on `category`
 *
 * Two physically different kinds of POI share the same subsystem but not
 * the same fields:
 *
 *   - **Extended structures** (cluster / supercluster / void) have a
 *     physical extent — they go through the ring/halo marker pass and
 *     carry a radius + a normalized significance.  `abell` (an ACO
 *     catalog designation) applies to clusters alone.
 *
 *   - **Famous galaxies** opt OUT of the marker pass (curated thumbnails
 *     on close approach do that job) and instead carry label/size fields:
 *     an apparent-size gate and per-POI label sizing/offset overrides.
 *
 * Modelling these as a flat record with category-exclusive optionals let
 * a famousGalaxy literal silently carry `physicalRadiusMpc`, or a void
 * literal omit it — the type couldn't tell a producer it had built the
 * wrong shape.  Splitting on `category` makes each arm exact: the radius
 * fields exist only where the marker pass reads them, and consumers must
 * narrow on `category` before touching arm-specific fields.
 */

import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

/**
 * Fields every POI carries regardless of category.  `category` is added
 * per-arm below so each arm's literal type pins a single discriminant.
 */
type PoiCommon = {
  readonly id: string;
  readonly name: string;
  readonly worldPos: Vec3;
  /**
   * Whether this POI is a hand-curated "featured" structure. Gates label
   * rendering (only featured POIs get labels — drawing ~375 labels is noise)
   * and deep-link eligibility (the sync drain can only resolve featured ids).
   * Bulk catalog POIs set false; cluster/SC/void anchors + famous galaxies
   * set true.
   */
  readonly featured: boolean;
  /**
   * Human-readable blurb shown in the expanded info card. For featured
   * structures this is a curated Wikipedia-lead paragraph (matching the
   * famous-galaxy treatment); for bulk catalog entries it's the build's
   * auto-generated one-liner (`X-ray cluster · M500 = … · z = …`). Optional
   * so a producer with no text can omit it — the card renders no
   * description rather than empty chrome.
   */
  readonly description?: string;
};

/**
 * Shared shape for the extended-structure arms (cluster / supercluster /
 * void).  These three go through the ring/halo marker pass and frame the
 * camera by physical radius.
 */
type ExtendedStructurePoi = PoiCommon & {
  /**
   * Normalized significance in [0,1] driving ring brightness / size weight.
   * For clusters this is a normalized M500; superclusters a normalized Nm;
   * featured anchors default to 1 (always full weight).  Optional so
   * producers that don't compute it fall back to full weight at the render
   * site.
   */
  readonly significance?: number;
  /**
   * Physical CORE radius of the structure in Mpc — virial / R_200 for
   * clusters, characteristic scale for superclusters and voids.
   *
   * Drives:
   *   - Camera-focus tween distance (how close `f` / Focus parks)
   *   - InfoCard's "r {value}" line (citable literature number)
   *
   * Required — every structure producer sets it.  See `apparentRadiusMpc`
   * for the wider visual/membership extent.
   */
  readonly physicalRadiusMpc: number;
  /**
   * Apparent / named-extent radius of the structure in Mpc — the wider
   * "what the user sees as the cluster" boundary.  Typically 2-3× the
   * `physicalRadiusMpc` for clusters; equal to it for superclusters and
   * voids (those structures have no virial core, so the literature value
   * IS the apparent extent).
   *
   * Drives:
   *   - The on-screen ring + halo half-extent (cluster marker render)
   *   - The label's close-approach fade-out, so the label disappears
   *     together with the disc it labels
   *   - Galaxy-membership cone search: which galaxies count as "part of
   *     this cluster" for visual hide/show
   *
   * Optional — the render falls back to `physicalRadiusMpc` when absent.
   * The static anchor builder always populates both.
   */
  readonly apparentRadiusMpc?: number;
};

/**
 * A galaxy cluster.  Clusters alone carry an Abell/ACO designation.
 */
type ClusterPoi = ExtendedStructurePoi & {
  readonly category: 'cluster';
  /**
   * Abell/ACO catalog designation where known (e.g. 'A1656' for Coma),
   * surfaced directly so the InfoCard can show it.  Omitted when the
   * cluster has no Abell number (e.g. Virgo).  Lives on the cluster arm
   * only — superclusters, voids, and galaxies never have one.
   */
  readonly abell?: string;
};

/** A supercluster — an extended structure with no Abell designation. */
type SuperclusterPoi = ExtendedStructurePoi & {
  readonly category: 'supercluster';
};

/** A cosmic void — an extended structure with no Abell designation. */
type VoidPoi = ExtendedStructurePoi & {
  readonly category: 'void';
};

/**
 * A famous individual galaxy.  Skips the marker pass entirely (its anchor
 * is the galaxy point itself) and carries the label/size fields the
 * structure arms never set.
 */
type FamousGalaxyPoi = PoiCommon & {
  readonly category: 'famousGalaxy';
  /**
   * Minimum on-screen pixel size at which this POI emits a label.  When
   * present together with `apparentDiameterKpc`, the producer projects the
   * diameter to pixels at the current camera distance and skips emission
   * below the threshold — avoiding clutter from galaxies smaller than the
   * underlying point billboard.  Absent → always emit.
   */
  readonly minApparentSizePx?: number;
  /**
   * Physical diameter in kpc, used together with `minApparentSizePx` for
   * apparent-size gating.  Populated from `famous.bin`'s `diameterKpc`
   * column.  If `minApparentSizePx` is set but this is absent, the gate
   * falls through (always emit) — safer than silently hiding a
   * misconfigured POI.
   */
  readonly apparentDiameterKpc?: number;
  /**
   * Static world-space vertical lift applied to the label's `worldPos`
   * and used as the length of an anchor marker-line drawn from the POI's
   * true position up to the label.  When set, the producer:
   *   - lifts the label by `[0, +labelAnchorOffsetMpc, 0]`
   *   - emits one vertical `MarkerLine` from `worldPos` to
   *     `worldPos + [0, 0.75 * labelAnchorOffsetMpc, 0]`
   *   - flips the label to `alignX: 'center'`
   * Mirror of `youAreHereSubsystem`'s fixed `LABEL_ANCHOR_MPC = 0.05`
   * world offset — kept static (not per-frame derived from camera
   * distance) so the `labelDirectorSubsystem` signature optimisation,
   * which excludes worldPos, doesn't strand the lift at whichever value
   * was first uploaded.  Set from the galaxy's physical diameter so the
   * pixel-offset stays proportional to its apparent size.
   */
  readonly labelAnchorOffsetMpc?: number;
  /**
   * Per-POI override for the label's world-space em size.  When omitted,
   * the producer uses the category's `POI_STYLES.famousGalaxy.worldEmMpc`.
   * Populated from a log-scaled function of the galaxy's physical diameter
   * so a bigger galaxy's label is naturally larger at any zoom; the
   * per-category `minPixelSize`/`maxPixelSize` clamps keep the visible
   * result bounded.  Same per-POI-static rationale as
   * `labelAnchorOffsetMpc`: stable across frames so the labelDirector's
   * signature optimisation keeps working.
   */
  readonly labelWorldEmMpc?: number;
};

export type PointOfInterest = ClusterPoi | SuperclusterPoi | VoidPoi | FamousGalaxyPoi;
