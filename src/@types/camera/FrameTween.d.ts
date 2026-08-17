/**
 * FrameTween — a transient descriptor for an in-flight orientation-frame roll.
 *
 * Switching orientation frames slerps the camera's up-basis from where it was
 * at the moment of the switch to the destination frame's pole. This descriptor
 * captures that animation as data: the basis quaternion at switch start, the
 * destination frame, and a duration + easing.
 *
 * Like `CameraTweenDescriptor`, it carries NO wall-clock — the animation clock
 * is an engine Resource, not a field here. `fromQuat` is the concrete basis
 * captured at switch start (not "wherever the camera happens to be now"), so the
 * descriptor stays valid across frames and survives serialisation and replay.
 * The destination quaternion is looked up from `ORIENTATION_FRAMES[to]`, so only
 * the id is stored.
 */

import type { Vec4 } from '../math/Vec4';
import type { OrientationFrameId } from './OrientationFrameId';
import type { Ease } from '../animation/Ease';

export type FrameTween = {
  readonly fromQuat: Vec4; // basis quaternion captured at switch start
  readonly to: OrientationFrameId; // destination frame (its quaternion is the slerp end)
  readonly durationMs: number;
  readonly easing: Ease;
};
