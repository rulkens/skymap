import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';
import type { PoseOf } from './PoseOf';

/** One rung's frame tag paired with its pose, keyed by kind `K`. */
export type FramedPose<K extends RungKind = RungKind> = {
  readonly frame: FrameOf[K];
  readonly pose: PoseOf[K];
};
