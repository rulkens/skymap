import type { BodyFixedPose } from './BodyFixedPose';
import type { SurfaceGesture } from './SurfaceGesture';

export type DraggedSurfacePose = {
  readonly pose: BodyFixedPose;
  readonly mode: SurfaceGesture['mode'];
};
