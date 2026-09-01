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
 * `frame` pins the frame the clip started under, so a mid-clip orientation
 * switch re-expresses the pose rather than reinterpreting every authored yaw
 * against a new pole. Null when no clip is active.
 *
 * `frameTween` carries the in-flight orientation-frame roll's serializable
 * descriptor while the up-basis slerps to a new frame. The basis during the
 * slerp is DERIVED per frame by a resolver, not written here — same principle
 * as `tween`. Null when no frame roll is in flight.
 */

import type { FramedCameraPose } from './FramedCameraPose';
import type { CameraTweenDescriptor } from './CameraTweenDescriptor';
import type { ClipData } from '../animation/ClipData';
import type { FrameTween } from './FrameTween';
import type { OrientationFrameId } from './OrientationFrameId';

export type CameraState = {
  /** The committed pose AND the frame it lives in — the regime itself (spec §4). */
  base: FramedCameraPose;
  tween: CameraTweenDescriptor | null;
  autoRotate: { active: boolean; rate: number };
  dragging: boolean;
  clip: { data: ClipData; frame: OrientationFrameId } | null;
  frameTween: FrameTween | null;
};
