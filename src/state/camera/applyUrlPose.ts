/**
 * applyUrlPose — the reducer-less COMMAND that asks `watchUrlPoseSaga` to
 * commit a `#pose=` deep link once the camera exists. Mirrors `requestFocus`:
 * dispatching it changes no state on its own.
 */
import { createAction } from '@reduxjs/toolkit';

import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';

export const applyUrlPose = createAction<FramedCameraPose>('camera/applyUrlPose');
