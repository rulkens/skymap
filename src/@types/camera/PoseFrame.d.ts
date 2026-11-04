import type { CameraArmKind } from './CameraArmKind';
import type { FrameOf } from './FrameOf';

/** The frame a stored or authored camera pose is expressed in (ruled, Q10). */
export type PoseFrame = FrameOf[CameraArmKind];
