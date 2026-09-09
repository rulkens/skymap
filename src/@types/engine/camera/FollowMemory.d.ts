/**
 * FollowMemory — what the follow driver carries across frames for ONE focus
 * row; `null` on `CameraRuntime` means no memory yet (a fresh focus). Dropped
 * whenever the follow epoch's ref changes (`runFrame`), refilled by the
 * driver's next produce — only it sees the live register, body radius and FOV.
 */

import type { CameraPose } from '../../camera/CameraPose';
import type { Vec3 } from '../../math/Vec3';

export type FollowMemory = {
  // The approach's `from`, eye-preserving against the NEW body (see the driver).
  readonly from: CameraPose | null;
  // Null = seed the framing distance; re-captured from `base.distance` when follow
  // re-wins after a drag's zoom, so the zoom sticks.
  readonly distanceTarget: number | null;
  // WORLD frame: reads as a stable screen strafe at follow scales with no
  // camera-basis re-projection needed.
  readonly panOffset: Vec3;
};
