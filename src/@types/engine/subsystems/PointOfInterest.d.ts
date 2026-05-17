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
};
