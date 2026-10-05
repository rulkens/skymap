import type { Vec3 } from '../../math/Vec3';

/**
 * PathSample — the camera pose a path produces at one instant: the four
 * channels a `flyPath` drives, evaluated together (they share one path
 * parameter, so they cannot be split into independent per-channel tracks).
 */
export type PathSample = {
  readonly target: Vec3;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
};
