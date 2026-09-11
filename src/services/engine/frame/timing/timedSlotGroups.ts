/**
 * TIMED_SLOT_GROUPS — the real timing slots grouped for the GpuTimingsSection.
 * Same walk that orders `TIMED_SLOTS`, so a pass that joins `CONTENT_PASSES`
 * and its `FRAME_ORDER` line gets a grouped row here with zero DebugPanel
 * edits.
 */

import type { TimedSlotGroup } from '../../../../@types/engine/frame/TimedSlotGroup';
import { MAX_PROGRAM } from './maxProgram';
import { timedSlotGroupsOf } from './timedSlotGroupsOf';

export const TIMED_SLOT_GROUPS: readonly TimedSlotGroup[] = timedSlotGroupsOf(MAX_PROGRAM);
