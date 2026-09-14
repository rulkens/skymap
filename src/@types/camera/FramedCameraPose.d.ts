import type { RungKind } from './RungKind';
import type { FramedPose } from './FramedPose';

/**
 * The authoritative camera pose and the frame it lives in, in the
 * tag-beside-channels form ruled for by T4 — the animation system is NOT
 * framed this way and keeps its own four channels.
 */
export type FramedCameraPose = { [K in RungKind]: FramedPose<K> }[RungKind];
