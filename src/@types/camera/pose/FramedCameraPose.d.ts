import type { CameraArmKind } from '../arms/CameraArmKind';
import type { FramedPose } from './FramedPose';

/** Derived over `CameraArmKind`; must spell what it spelled before T4's tag-beside-channels form. */
export type FramedCameraPose = { [K in CameraArmKind]: FramedPose<K> }[CameraArmKind];
