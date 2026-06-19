/**
 * CameraTweenDescriptor — a timeless "from → to" camera animation plan.
 *
 * Unlike the legacy `CameraTween` (which carries `startMs: performance.now()`),
 * this descriptor holds only absolute poses and duration. The animation clock
 * is an engine Resource, not a part of this type — so the descriptor remains
 * valid across frames and can be stored/replayed without wall-clock coupling.
 * Interrupting an in-flight tween simply creates a new descriptor from the
 * current pose, never requiring the original `startMs`.
 */

import type { CameraPose } from './CameraPose';

export type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  durationMs: number;
  easing: 'easeOutCubic';
};
