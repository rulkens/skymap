import type { Vec3 } from '../../math/Vec3';

/** One scene-star POINT-partition body: its camera-relative anchor + packed id. */
export type BodyPointPick = {
  /** Star position rebased into the camera-relative frame (Mpc, f64→f32-safe). */
  readonly posRelCamMpc: Vec3;
  /** Fully-packed pick id (`packSelection(code, seedIndex + offset)`). */
  readonly packedId: number;
};
