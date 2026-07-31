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
import type { Ease } from '../animation/Ease';

export type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  durationMs: number;
  easing: Ease;
  /**
   * The pan/zoom trade-off the producer derived `durationMs` under. It rides the
   * descriptor for the same reason `easing` does — `tweenToClip` compiles the
   * glide with no store access, and the shape the camera walks then cannot
   * disagree with the arc length its duration came from. Omitted ⇒
   * `GLIDE_RHO_DEFAULT`, matching the `glide` effect's own optional `rho`.
   */
  rho?: number;
};
