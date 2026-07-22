/**
 * orientationActions — the request signal that drives an interactive orientation
 * switch from the UI.
 *
 * `requestOrientationChange(frame)` asks to make `frame` the camera's "up" pole.
 * A switch is two effects: persist the target frame (settings) AND animate the
 * up-basis roll toward it (the camera slice's `frameTween`). It is reducer-less —
 * orientation STATE lives in the settings slice (`setOrientation`) and the roll
 * descriptor in the camera slice (`startFrameTween`); this is the higher-level
 * intent the saga translates into that pair.
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
