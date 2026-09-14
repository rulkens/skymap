import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';
import type { PoseOf } from './PoseOf';

/**
 * One rung's frame tag paired with its pose, keyed by kind `K`. Distributed
 * over `K` so a widened key (`rowFor`'s, when the frame is a union) still
 * yields CORRELATED pairs rather than any tag beside any pose.
 */
export type FramedPose<K extends RungKind = RungKind> = {
  [P in K]: { readonly frame: FrameOf[P]; readonly pose: PoseOf[P] };
}[K];
