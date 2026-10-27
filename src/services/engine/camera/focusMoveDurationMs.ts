/** focusMoveDurationMs — how long a camera tween runs; the tween driver retires on it. */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import { FOCUS_MOTIONS } from './focusMotions';

export function focusMoveDurationMs(d: CameraTweenDescriptor): number {
  return FOCUS_MOTIONS[d.motion.style].durationMsOf(d);
}
