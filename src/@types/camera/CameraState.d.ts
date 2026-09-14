/**
 * CameraState — Redux slice shape for the camera's full Intent state.
 *
 * `clip` and `frameTween` hold serializable descriptors only: the pose during
 * a clip and the up-basis during a frame slerp are DERIVED per frame (driver
 * table / resolver), never written here — same principle as `tween`.
 * `clip.frame` pins the frame the clip started under, so a mid-clip
 * orientation switch re-expresses the pose rather than reinterpreting every
 * authored yaw against a new pole.
 */

import type { FramedCameraPose } from './FramedCameraPose';
import type { CameraTuning } from './CameraTuning';
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
  /** The band edges the camera math is threaded with; session-only, never serialized. `readonly`: always replaced whole. */
  readonly tuning: CameraTuning;
};
