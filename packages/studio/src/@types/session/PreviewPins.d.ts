/** Q7: what the studio pins when a clip opens, so scrubbing never depends on where the camera sits. */
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import type { OrientationFrameId } from '../../../../../src/@types/camera/orientation/OrientationFrameId';

export type PreviewPins = {
  readonly startPose: CameraPose;
  /** The frozen sim instant, Julian days. */
  readonly simDays: number;
  readonly frame: OrientationFrameId;
  readonly fovYRad: number;
};
