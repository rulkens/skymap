/**
 * CameraTweenDescriptor — a timeless "from → to" camera animation plan.
 *
 * The descriptor holds only absolute poses and a duration; the animation clock
 * is an engine Resource, not a field of this type — so the descriptor carries
 * no wall-clock and stays valid across frames, storable and replayable.
 * Interrupting an in-flight tween simply creates a new descriptor from the
 * current pose.
 */

import type { CameraPose } from './CameraPose';

export type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  durationMs: number;
  easing: 'easeOutCubic';
};
