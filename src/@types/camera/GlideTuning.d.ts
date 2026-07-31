/**
 * GlideTuning — the four calibration knobs of a focus glide, carried as one
 * record because they are calibrated together and meaningless apart (see
 * `glideCalibration` for the derivation). ρ shapes the geodesic AND its arc
 * length; `velocity` and the two clamp bounds only convert that length to
 * seconds, so they never have to reach the compiled path.
 */

export type GlideTuning = {
  /** Pan/zoom trade-off handed to `zoomPanGeodesic`. */
  rho: number;
  /** Geodesic arc-length units per second: durationSec = length / velocity. */
  velocity: number;
  minSec: number;
  maxSec: number;
};
