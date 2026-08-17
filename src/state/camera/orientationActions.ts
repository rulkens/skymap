/**
 * orientationActions — the request signal that drives an interactive orientation
 * switch from the UI.
 *
 * `requestOrientationChange(frame)` asks to make `frame` the camera's "up" pole.
 * A switch is THREE effects (`watchOrientationChangeSaga`): persist the target
 * frame (settings, `setOrientation`), re-express `camera.base` into it so the
 * eye holds still the instant the up-basis flips (`commitCameraPose` +
 * `reencodePose` — the load-bearing one: skip it and the pose stays expressed
 * in the OUTGOING basis while the pole rolls out from under it), AND animate
 * the up-basis roll toward the new frame (the camera slice's `frameTween`). It
 * is reducer-less — orientation STATE lives in the settings slice and the roll
 * descriptor in the camera slice; this is the higher-level intent the saga
 * translates into that triple.
 *
 * The saga owns the capture the UI cannot do: the roll's start quaternion must be
 * the LIVE up-basis resolved this frame (read off the engine's frame-loop
 * resource), so a re-switch mid-slerp composes continuously rather than snapping
 * the pole back to the committed frame. Keeping it a request action (the saga
 * reads the live basis, not the UI) means a control only names a frame; it never
 * touches either slice or the camera runtime — the same split `clipActions.ts`
 * draws between naming a clip and the saga resolving its live pose.
 */
import { createAction } from '@reduxjs/toolkit';

import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';

export const requestOrientationChange = createAction(
  'orientation/request',
  (frame: OrientationFrameId) => ({ payload: frame }),
);
