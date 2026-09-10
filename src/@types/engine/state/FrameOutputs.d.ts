/**
 * FrameOutputs — what the last frame DREW, stored rather than re-derived so a
 * between-frame reader (pick, demand, debug) agrees with it: a resize or a
 * sim-clock advance must not retro-change the aspect or the epoch a pick
 * resolves against. `displayed` = register + render-side tilt; `simDays` in
 * Julian days; `upBasis` = the live B(t); `lastZoomFactor` null until a notch.
 */

import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { Mat3 } from '../../math/Mat3';

export type FrameOutputs = {
  readonly displayed: FramedCameraPose;
  readonly simDays: number;
  readonly upBasis: Mat3;
  readonly projection: CameraProjection;
  readonly lastZoomFactor: number | null;
};
