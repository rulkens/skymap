/**
 * FollowMemory — what the follow driver carries across frames for ONE focus
 * row; `null` on `CameraRuntime` = no memory yet. `runFrame` drops it when the
 * follow epoch's ref changes; the driver's next produce refills it.
 */

import type { CameraPose } from '../../camera/CameraPose';
import type { Vec3 } from '../../math/Vec3';

export type FollowMemory = {
  /** The approach's `from`, eye-preserving against the NEW body. */
  readonly from: CameraPose | null;
  /** Null = seed the framing distance; re-captured from `base.distance` when
   * follow re-wins after a drag's zoom, so the zoom sticks. */
  readonly distanceTarget: number | null;
  /** WORLD frame — a stable screen strafe at follow scales, no basis re-projection. */
  readonly panOffset: Vec3;
};
