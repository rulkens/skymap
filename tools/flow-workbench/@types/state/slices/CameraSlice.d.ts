/**
 * CameraSlice — orbit-camera pose plus the derived view-projection matrix.
 *
 * `yaw`/`pitch`/`distance` are the user-facing orbit controls and `autoRotate`
 * drives the idle spin. `viewProj` is the matrix the orbit math produces from
 * those each frame; it lives in state (rather than being recomputed by every
 * consumer) so the engine can write it once and every layer reads the same
 * value through FrameContext.
 */
import type { Mat4 } from '../../../../../src/@types/math/Mat4';

export type CameraSlice = {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly autoRotate: boolean;
  readonly viewProj: Mat4;
};
