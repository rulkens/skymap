import type { Vec3 } from '../../math/Vec3';
import type { PoiCategory } from '../../../services/engine/subsystems/poiSubsystem';

export type PointOfInterest = {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly worldPos: Vec3;
  /** Crosshair half-length in Mpc.  Omit to draw label only. */
  readonly crosshairSizeMpc?: number;
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
};
