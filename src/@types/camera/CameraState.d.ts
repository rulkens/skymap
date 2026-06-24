/**
 * CameraState — Redux slice shape for the camera's full Intent state.
 *
 * Holds the base orbit pose, an optional in-flight tween descriptor,
 * and the auto-rotate and dragging state flags that the engine uses
 * to decide each frame's pose and wake signals.
 *
 * `clip` carries the active animation clip's serializable descriptor while
 * a clip is playing. Pose during the clip is DERIVED per frame by the
 * driver table (clip@95 wins), not written here — same principle as `tween`.
 * Null when no clip is active.
 */

import type { CameraPose } from './CameraPose';
import type { CameraTweenDescriptor } from './CameraTweenDescriptor';
import type { ClipData } from '../animation/ClipData';

export type CameraState = {
  base: CameraPose;
  tween: CameraTweenDescriptor | null;
  autoRotate: { active: boolean; rate: number };
  dragging: boolean;
  clip: { data: ClipData } | null;
};
