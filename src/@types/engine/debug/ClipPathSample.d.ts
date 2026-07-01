/**
 * One sampled instant of a compiled clip's camera path, for the debug
 * clip-path inspector. The inspector samples a clip uniformly in TIME (so the
 * scrubber maps linearly and the speed colour is comparable along the route)
 * and stores these.
 */

import type { Vec3 } from '../../math/Vec3';

export type ClipPathSample = {
  /** Seconds since the clip start (uniform spacing across the snapshot). */
  readonly t: number;
  /** Camera eye (world Mpc), reconstructed from the pose via the orbit convention. */
  readonly eye: Vec3;
  /** Camera look-at target (world Mpc). */
  readonly target: Vec3;
  /** Orbit distance eye→target (Mpc). */
  readonly distance: number;
  /**
   * Perceived (scale-space) camera speed at this instant, NORMALISED to [0,1]
   * across the whole path — 0 = the path's slowest, 1 = its fastest. Scale-space
   * (angular lateral + log-radial motion per second) is the metric the flyPath
   * primitive's pacing is built on, so it reveals the whip / dwell being tuned.
   */
  readonly speed01: number;
};
