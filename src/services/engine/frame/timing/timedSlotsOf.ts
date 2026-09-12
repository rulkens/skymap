/**
 * timedSlotsOf — the ordered slot names: per render step one slot per pass it
 * draws then the step's group total; per composite a `'<source>→<dest>'` slot
 * (the unicode arrow); one `'bloom'`; nothing for a compute. `'pick'` is
 * appended last, matching the frame's execution order.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import { timedSlotRowsOf } from './timedSlotRowsOf';

export function timedSlotsOf(program: readonly FrameStep[]): readonly string[] {
  return timedSlotRowsOf(program).map((row) => row.name);
}
