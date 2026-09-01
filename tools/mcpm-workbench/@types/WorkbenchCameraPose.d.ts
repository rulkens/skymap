import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * WorkbenchCameraPose — the committed shape of `ViewSlice['camera']` minus
 * `autoRotate` (a toggle, not a pose field). Shared by `commitCameraPose`'s
 * payload, the input module's live drag register, and `cameraViewFor`, so
 * gesture code, the reducer and the renderer agree on one camera shape.
 */
export type WorkbenchCameraPose = {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly targetMpc: Vec3;
};
