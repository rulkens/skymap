/**
 * timedSlotGroupsOf — the ordered GPU-timing slots grouped for display, the
 * shape both DebugPanel lists consume. A projection of the same program +
 * registry walk that orders `timedSlotsOf`, so the grouping can't drift from
 * the executed frame.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import type { TimedSlotGroup } from '../../../../@types/engine/frame/TimedSlotGroup';
import { groupRows } from './groupRows';
import { timedSlotRowsOf } from './timedSlotRowsOf';

export function timedSlotGroupsOf(program: readonly FrameStep[]): readonly TimedSlotGroup[] {
  return groupRows(timedSlotRowsOf(program));
}
