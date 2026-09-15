import type { RungKind } from './RungKind';
import type { FramedPose } from './FramedPose';

/** Derived over `RungKind`; must spell what it spelled before T4's tag-beside-channels form. */
export type FramedCameraPose = { [K in RungKind]: FramedPose<K> }[RungKind];
