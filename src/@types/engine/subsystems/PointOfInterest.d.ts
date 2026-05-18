import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /**
   * Physical CORE radius of the structure in Mpc — virial / R_200 for
   * clusters, characteristic scale for superclusters and voids.
   *
   * Drives:
   *   - Camera-focus tween distance (how close `f` / Focus parks)
   *   - InfoCard's "r {value}" line (citable literature number)
   *
   * Omit on POIs that have no extent (e.g. famous-galaxy entries that
   * route through the existing thumbnail/label path instead).
   *
   * Renamed from `crosshairSizeMpc` on 2026-05-18; split from a single-
   * field design into core+apparent shortly after (see
   * `apparentRadiusMpc` below for the wider visual/membership extent).
   * See docs/superpowers/specs/2026-05-18-cluster-supercluster-viz-design.md
   * §7.2 for the original rename rationale.
   */
  readonly physicalRadiusMpc?: number;
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
   *   - Future galaxy-membership cone search (sub-plan 4): which
   *     galaxies count as "part of this cluster" for visual hide/show
   *
   * Optional to mirror `physicalRadiusMpc`'s shape — POIs that opt out
   * of the marker pass (famous galaxies) leave both fields undefined.
   * When set on a POI without `physicalRadiusMpc`, the producer falls
   * back to apparent for the marker pass.  The static anchor builder
   * always populates both from `ClusterAnchor` (which requires both).
   */
  readonly apparentRadiusMpc?: number;
  /**
   * Minimum on-screen pixel size at which this POI emits a label.  When
   * present together with `apparentDiameterKpc`, the producer projects
   * the diameter to pixels at the current camera distance and skips
   * emission below the threshold.  Famous galaxies use this to avoid
   * cluttering far zooms with labels for galaxies smaller than the
   * underlying point billboard.  Absent → always emit (the default for
   * cluster / supercluster / void anchors).
   */
  readonly minApparentSizePx?: number;
  /**
   * Physical diameter in kpc, used together with `minApparentSizePx`
   * for apparent-size gating.  Famous-galaxy entries populate this
   * from `famous.bin`'s `diameterKpc` column; cluster / supercluster
   * / void anchors omit it (no sensible "diameter" for an extended
   * structure).  If `minApparentSizePx` is set but this is absent,
   * the gate falls through (always emit) — safer than silently
   * hiding a misconfigured POI.
   */
  readonly apparentDiameterKpc?: number;
  /**
   * Static world-space vertical lift applied to the label's `worldPos`
   * and used as the length of an anchor marker-line drawn from the
   * POI's true position up to the label.  When set, the producer:
   *   - lifts the label by `[0, +labelAnchorOffsetMpc, 0]`
   *   - emits one vertical `MarkerLine` from `worldPos` to
   *     `worldPos + [0, 0.75 * labelAnchorOffsetMpc, 0]`
   *   - flips the label to `alignX: 'center'`
   * Mirror of `youAreHereSubsystem`'s fixed `LABEL_ANCHOR_MPC = 0.05`
   * world offset — kept static (not per-frame derived from camera
   * distance) so the `labelDirectorSubsystem` signature optimisation,
   * which excludes worldPos, doesn't strand the lift at whichever
   * value was first uploaded.  Famous-galaxy POIs set this from their
   * physical diameter (so pixel-offset stays proportional to the
   * galaxy's apparent size); cluster / supercluster / void anchors
   * omit it and the label anchors directly on the POI as before.
   */
  readonly labelAnchorOffsetMpc?: number;
  /**
   * Per-POI override for the label's world-space em size.  When omitted,
   * the producer uses the category's `POI_STYLES[category].worldEmMpc`.
   * Famous-galaxy POIs populate this from a log-scaled function of the
   * galaxy's physical diameter so a bigger galaxy's label is naturally
   * larger at any zoom; the per-category `minPixelSize`/`maxPixelSize`
   * clamps keep the visible result bounded.  Same per-POI-static rationale
   * as `labelAnchorOffsetMpc`: stable across frames so the labelDirector's
   * signature optimisation keeps working.
   */
  readonly labelWorldEmMpc?: number;
};
