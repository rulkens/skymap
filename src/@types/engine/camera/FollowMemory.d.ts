/**
 * FollowMemory — what the follow rows carry for ONE focus row; `null` = none yet.
 * `stepCameraRuntime` drops it on a follow-epoch ref change; the produce refills.
 * `from` is captured eye-preserving against the NEW body (R12b-1); `saturated` is
 * the approach's hand-off signal, set on the frame its ease reached 1.
 */

import type { CameraPose } from '../../camera/CameraPose';
import type { Vec3 } from '../../math/Vec3';

export type FollowMemory = {
  readonly from: CameraPose | null;
  /** Mpc; three sources, resolved in `followPose`. */
  readonly distanceTarget: number | null;
  /** WORLD frame — a stable screen strafe at follow scales, no basis re-projection. */
  readonly panOffset: Vec3;
  readonly saturated: boolean;
};
