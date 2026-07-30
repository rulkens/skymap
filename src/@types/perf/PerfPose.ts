/**
 * PerfPose — a fully-specified orbit-camera pose the perf harness drives the
 * engine into before it starts sampling GPU timings.
 *
 * The harness measures frame cost as a function of *where the camera is*, so a
 * benchmark run is meaningless unless it can place the camera at an exact,
 * reproducible vantage. This is that vantage: the orbit target plus the three
 * orbit angles/radius, mirroring the OrbitCamera's own state so `setPose` can
 * assign it wholesale rather than tweening through intermediate poses (a
 * benchmark wants a hard cut, not choreography).
 *
 * `rate` is optional because most benchmark poses are static holds; when it is
 * omitted the installer falls back to its `PERF_AUTO_ROTATE_RATE` constant so a
 * "slow orbit while sampling" scenario needs to name only the delta, not
 * restate the default at every call site.
 */

import type { Vec3 } from '../math/Vec3';

export type PerfPose = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
  /** Per-frame yaw advance; omitted → the installer's PERF_AUTO_ROTATE_RATE fallback. */
  rate?: number;
};
