/**
 * FrameOutputs — what the last frame PUBLISHED, stored rather than re-derived
 * so a between-frame reader (pick, demand, debug) agrees with the frame that
 * was drawn: a resize or a sim-clock advance must not retro-change the aspect
 * or the epoch a pick resolves against. `runFrame` is the only writer.
 */

import type { CameraProjection } from '../../camera/CameraProjection';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { Mat3 } from '../../math/Mat3';

export type FrameOutputs = {
  /** The pose the frame DREW — the register plus the render-side tilt;
   * on-screen reads go through `liveWorldPose`. */
  readonly displayed: FramedCameraPose;
  /** Sim instant (Julian days) the frame drew its bodies at; the pick path
   * re-derives against it — a construction-time `deriveBodyStates(CONST_J2000)`
   * here poisons the pick epoch. */
  readonly simDays: number;
  /** The frame's resolved orientation basis B(t) — NOT the clip-authoring
   * `frameBasis` parameter. */
  readonly upBasis: Mat3;
  /** Aspect from the canvas on resize, fovYRad from settings every frame. */
  readonly projection: CameraProjection;
  /** The last zoom step's factor, for the debug readout; null until the first notch. */
  readonly lastZoomFactor: number | null;
};
