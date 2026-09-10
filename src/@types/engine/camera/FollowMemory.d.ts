/**
 * FollowMemory — what the follow rows carry for ONE focus row; `null` = none yet.
 * `stepCameraRuntime` drops it on a follow-epoch ref change; the produce refills.
 */

import type { CameraPose } from '../../camera/CameraPose';
import type { Vec3 } from '../../math/Vec3';

export type FollowMemory = {
  /** The approach's `from`, eye-preserving against the NEW body. */
  readonly from: CameraPose | null;
  /** Mpc; null = not captured yet (three sources, resolved in `followPose`). */
  readonly distanceTarget: number | null;
  /** WORLD frame — a stable screen strafe at follow scales, no basis re-projection. */
  readonly panOffset: Vec3;
  /** The approach's hand-off signal: its ease reached 1 on the frame that set this. */
  readonly saturated: boolean;
};
