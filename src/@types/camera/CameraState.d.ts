/**
 * CameraState — Redux slice shape for the camera's full Intent state.
 *
 * Holds the base orbit pose, an optional in-flight tween descriptor,
 * and the auto-rotate and dragging state flags that the engine uses
 * to decide each frame's pose and wake signals.
 */

import type { CameraPose } from './CameraPose';
import type { CameraTweenDescriptor } from './CameraTweenDescriptor';

export type CameraState = {
  base: CameraPose;
  tween: CameraTweenDescriptor | null;
  autoRotate: { active: boolean; rate: number };
  dragging: boolean;
};
