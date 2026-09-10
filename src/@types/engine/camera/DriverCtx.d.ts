/**
 * DriverCtx — every value a camera driver may read this frame; the table is a
 * module constant, so a driver sees the frame ONLY through this bag.
 */

import type { CameraPose } from '../../camera/CameraPose';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { PivotFraming } from '../../camera/PivotFraming';
import type { RootState } from '../../../store/types';

export type DriverCtx = {
  readonly state: RootState;
  /** Elapsed on the WINNER's epoch row; 0 for the untimed rows. */
  readonly elapsedMs: number;
  /** The AUTHORED register (`lastPose`), pre-projection — R12b-1. */
  readonly register: FramedCameraPose;
  /** World arm of `register`; the follow capture reads its eye. */
  readonly authoredWorld: CameraPose;
  readonly winnerLastFrame: string;
  readonly simDays: number;
  readonly projection: CameraProjection;
  readonly pivot: PivotFraming;
  /** This frame's notch-resolved follow distance; the follow driver adopts it
   * into its memory. Null on a frame with no swallowed notch. */
  readonly followDistanceTarget: number | null;
};
