/**
 * GlidePath — the camera-domain view of a `zoomPanGeodesic`: a straight-line
 * `target` lift plus a derived, clamped `durationSec`. Produced by
 * `glidePath.ts`, the one place the §2.1 unit contract lives.
 */

import type { Vec3 } from '../math/Vec3';

/** A focus move sampled by arc fraction, with its derived duration. */
export type GlidePath = {
  /** clamp(length / GLIDE_VELOCITY, GLIDE_MIN_SEC, GLIDE_MAX_SEC), in seconds. */
  readonly durationSec: number;
  /** arcFrac ∈ [0, 1] → the pose at that fraction of the geodesic's arc length. */
  readonly at: (arcFrac: number) => { readonly target: Vec3; readonly distance: number };
};
