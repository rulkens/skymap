import type { BodyFixedPose } from '../../../../../../../@types/camera/pose/BodyFixedPose';
import type { SurfaceGesture } from '../../../../../../../@types/camera/arms/SurfaceGesture';

export type DraggedSurfacePose = {
  readonly pose: BodyFixedPose;
  readonly mode: SurfaceGesture['mode'];
};
