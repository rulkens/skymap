import type { CameraArmKind } from '../arms/CameraArmKind';
import type { FrameOf } from '../arms/FrameOf';
import type { PoseOf } from '../arms/PoseOf';

/**
 * One arm's frame tag paired with its pose, keyed by kind `K`. Distributed
 * over `K` so a widened key (`rowFor`'s, when the frame is a union) still
 * yields CORRELATED pairs rather than any tag beside any pose.
 */
export type FramedPose<K extends CameraArmKind = CameraArmKind> = {
  [P in K]: { readonly frame: FrameOf[P]; readonly pose: PoseOf[P] };
}[K];
