/** focusMoveEase — the ease a camera tween's clip runs on, shared by the lookOffset fade. */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { Ease } from '../../../@types/animation/Ease';
import { focusMotionRowOf } from './focusMotionRowOf';

export function focusMoveEase(d: CameraTweenDescriptor): Ease {
  return focusMotionRowOf(d).easeOf(d);
}
