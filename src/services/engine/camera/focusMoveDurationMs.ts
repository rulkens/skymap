/** focusMoveDurationMs — how long a camera tween runs; the tween driver retires on it. */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import { focusMotionRowOf } from './focusMotionRowOf';

export function focusMoveDurationMs(d: CameraTweenDescriptor): number {
  return focusMotionRowOf(d).durationMsOf(d);
}
