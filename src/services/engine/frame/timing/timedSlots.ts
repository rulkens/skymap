/**
 * TIMED_SLOTS — the engine's ordered GPU-timing slots, the single source of
 * truth for both query-set slot allocation (`createGpuTimingService`) and
 * DebugPanel display order (`GpuTimingsSection`). Derived from the SAME
 * `FRAME_ORDER` expansion the executor walks, so neither the query-set
 * allocation nor the DebugPanel can see a slot list the frame does not run.
 */

import { MAX_PROGRAM } from './maxProgram';
import { timedSlotsOf } from './timedSlotsOf';

export const TIMED_SLOTS: readonly string[] = timedSlotsOf(MAX_PROGRAM);
