/**
 * GeodesicPath — the camera-domain view of a `zoomPanGeodesic`: a straight-line
 * `target` lift plus a derived, clamped `durationMs`. Produced by
 * `geodesicPath.ts`, the one place the (target, distance) ↔ (u, w) unit
 * contract lives.
 */

import type { Vec3 } from '../math/Vec3';

/** A focus move sampled by arc fraction, with its derived duration. */
export type GeodesicPath = {
  /** clamp(length / velocity · 1000, minMs, maxMs); minMs wins when they cross. */
  readonly durationMs: number;
  /** arcFrac ∈ [0, 1] → the pose at that fraction of the geodesic's arc length. */
  readonly at: (arcFrac: number) => { readonly target: Vec3; readonly distance: number };
};
