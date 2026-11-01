import type { Ease } from '../animation/Ease';

/**
 * GeodesicTuning — the calibration knobs of a Geodesic focus move, one record
 * because they are calibrated together and meaningless apart (calibration in
 * `focusMoveDefaults`). ρ shapes the path AND its arc length; `velocity` and the
 * clamp bounds only turn that length into a duration; `ease` reparametrises the
 * timed arc, shaping the arrival but never the path. It must be monotone.
 */
export type GeodesicTuning = {
  /** Pan/zoom trade-off handed to `zoomPanGeodesic`; floored at `GEODESIC_RHO_MIN`. */
  readonly rho: number;
  /** Geodesic arc-length units per second. */
  readonly velocity: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly ease: Ease;
};
