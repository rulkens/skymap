import type { CameraPose } from '../camera/CameraPose';
import type { PoseFrame } from '../camera/PoseFrame';

/**
 * The four animation channels plus the frame they were interpolated in.
 *
 * `'absolute'` ⇒ `channels` is Mpc and orientation-frame angles. A body frame ⇒
 * body-FIXED metres and angles about the body's own axes — a LookAt, which the
 * driver decodes to a `BodyFixedPose` on its way out (spec §8).
 */
export type FramedClipPose = {
  readonly frame: PoseFrame;
  readonly channels: CameraPose;
};
