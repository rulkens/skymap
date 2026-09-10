/**
 * DriverCtx — every value a camera driver may read this frame; the table is a
 * module constant, so a driver sees the frame ONLY through this bag.
 */

import type { BodyId } from '../../data/body/BodyId';
import type { BodyState } from '../../scene/BodyState';
import type { CameraPose } from '../../camera/CameraPose';
import type { CameraProjection } from '../../camera/CameraProjection';
import type { DriverId } from './DriverId';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { Mat3 } from '../../math/Mat3';
import type { RootState } from '../../../store/types';

export type DriverCtx = {
  readonly state: RootState;
  /** Elapsed on the winner's own `epoch` row (`CameraDriver`); 0 for the untimed rows. */
  readonly elapsedMs: number;
  /** The AUTHORED register (`cameraRuntime.register.pose`), pre-projection — R12b-1. */
  readonly register: FramedCameraPose;
  /** World arm of `register`; the follow capture reads its eye. */
  readonly authoredWorld: CameraPose;
  readonly winnerLastFrame: DriverId;
  /** The frame's COMMITTED orientation basis (`stepCameraRuntime`); the live
   * `upBasis` is the fold's, and no driver reads it. */
  readonly poseBasis: Mat3;
  /** Julian days. */
  readonly simDays: number;
  readonly projection: CameraProjection;
  /** This instant's body states — a frame-tagged keyframe converts through them. */
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  /** Mpc; null on a frame with no swallowed wheel notch. */
  readonly followDistanceTarget: number | null;
};
