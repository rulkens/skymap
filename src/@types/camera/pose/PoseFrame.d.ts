import type { CameraArmKind } from '../arms/CameraArmKind';
import type { FrameOf } from '../arms/FrameOf';

/** The frame a stored or authored camera pose is expressed in (ruled, Q10). */
export type PoseFrame = FrameOf[CameraArmKind];
