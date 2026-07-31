import type { Ease } from '../animation/Ease';

/**
 * GlideTuning — the calibration knobs of a focus glide, carried as one
 * record because they are calibrated together and meaningless apart (see
 * `glideCalibration` for the derivation). ρ shapes the geodesic AND its arc
 * length; `velocity` and the two clamp bounds only convert that length to
 * seconds, so they never have to reach the compiled path. `ease` reparametrises
 * the already-timed arc — it shapes the ARRIVAL, not the path or the duration.
 */

export type GlideTuning = {
  /** Pan/zoom trade-off handed to `zoomPanGeodesic`. */
  rho: number;
  /** Geodesic arc-length units per second: durationSec = length / velocity. */
  velocity: number;
  minSec: number;
  maxSec: number;
  /** Reparametrises arc-length progress before sampling the path. */
  ease: Ease;
};
