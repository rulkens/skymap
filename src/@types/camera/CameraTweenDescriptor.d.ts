/**
 * CameraTweenDescriptor — a timeless "from → to" camera animation plan.
 *
 * The descriptor holds only absolute poses and how to fly between them
 * (`motion`); the animation clock is an engine Resource, not a field of this
 * type — so the descriptor carries no wall-clock and stays valid across frames,
 * storable and replayable. Interrupting an in-flight tween simply creates a
 * new descriptor from the current pose.
 *
 * `frame` pins the orientation frame `from`/`to` were captured under (the
 * setting live at build time), so a mid-tween orientation switch re-expresses
 * the pose instead of reinterpreting its yaw/pitch against a new pole — same
 * contract as `camera.clip.frame` (see CameraState.d.ts).
 */

import type { CameraPose } from './CameraPose';
import type { FocusMotion } from './FocusMotion';
import type { OrientationFrameId } from './OrientationFrameId';

export type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  motion: FocusMotion;
  frame: OrientationFrameId;
};
