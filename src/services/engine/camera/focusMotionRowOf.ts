/**
 * focusMotionRowOf — the `FOCUS_MOTIONS` row for a descriptor's `motion.style`.
 *
 * TS cannot correlate `FOCUS_MOTIONS[d.motion.style]` with `d`: indexing by a
 * union intersects the rows' parameters, so a second style would make every
 * `row.clipOf(d)` fail to typecheck. The table's mapped type guarantees row and
 * style agree, so this one cast is sound, and every reader goes through here.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { FocusMotion } from '../../../@types/camera/FocusMotion';
import type { FocusMotionRow } from '../../../@types/camera/FocusMotionRow';
import { FOCUS_MOTIONS } from './focusMotions';

export function focusMotionRowOf(d: CameraTweenDescriptor): FocusMotionRow<FocusMotion> {
  return FOCUS_MOTIONS[d.motion.style] as FocusMotionRow<FocusMotion>;
}
