/**
 * FrameOutputs — what the last frame DREW, stored rather than re-derived so a
 * between-frame reader (pick, demand, debug) agrees with it: a resize or a
 * sim-clock advance must not retro-change the aspect or the epoch a pick
 * resolves against. `displayed` = register + render-side tilt; `upBasis` = the
 * live B(t). `simDays` (Julian days) is the instant the pick path reads — NOT
 * `deriveBodyStates`' memo key, which a between-frames
 * `deriveBodyStates(CONST_J2000)` can repoint under it. `frustum` is the main
 * view's, the one value draw and cursor-ray pick both read.
 */

import type { CameraProjection } from '../../camera/projection/CameraProjection';
import type { FramedCameraPose } from '../../camera/pose/FramedCameraPose';
import type { Mat3 } from '../../math/Mat3';
import type { ViewFrustum } from '../../camera/projection/ViewFrustum';

export type FrameOutputs = {
  readonly displayed: FramedCameraPose;
  readonly simDays: number;
  readonly upBasis: Mat3;
  readonly projection: CameraProjection;
  readonly frustum: ViewFrustum;
  /** `maxDrawPxPerRad` over the frame's views, which derive after the step: the step carries
   *  last frame's value forward and runFrame overwrites it in place. 0 before the first view. */
  drawPxPerRad: number;
};
