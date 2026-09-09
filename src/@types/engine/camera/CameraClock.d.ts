/**
 * CameraClock — engine-transient timers: "this descriptor's reference changed"
 * → "ms elapsed since it started", so store shapes stay wall-clock free.
 * Each `last*Ref` fires its reset exactly once, on the arrival frame.
 */

import type { CameraTweenDescriptor } from '../../camera/CameraTweenDescriptor';
import type { CameraPose } from '../../camera/CameraPose';
import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { CameraState } from '../../camera/CameraState';
import type { SelectionRow } from '../SelectionRow';
import type { FrameTween } from '../../camera/FrameTween';
import type { Vec3 } from '../../math/Vec3';

export type CameraClock = {
  tweenStartMs: number | null;
  autoRotateStartMs: number | null;
  lastTweenRef: CameraTweenDescriptor | null;
  lastAutoRotateActive: boolean;
  frameTweenStartMs: number | null;
  lastFrameTweenRef: FrameTween | null;
  // Focus ROW ref, not body id: a same-body re-select restarts the ease, a drag mid-follow does not.
  followStartMs: number | null;
  lastFollowRef: SelectionRow | null;
  // The approach's `from`, relative to the NEW body; nulled on the focus edge and
  // refilled by the driver's next produce (only it sees the live register).
  followFrom: CameraPose | null;
  // Null = fresh focus (the driver seeds the framing distance); re-seeded to
  // `base.distance` when follow re-wins after a drag's zoom, so the zoom sticks.
  followDistanceTarget: number | null;
  // WORLD frame, not camera frame: reads as a stable screen strafe at follow scales with no camera-basis re-projection needed; zeroed on the focus edge only when follow wins.
  followPanOffset: Vec3;
  lastBaseRef: FramedCameraPose | null;
  clipStartMs: number | null;
  lastClipRef: CameraState['clip'];
};
