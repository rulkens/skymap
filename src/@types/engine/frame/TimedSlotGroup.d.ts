/**
 * TimedSlotGroup — a run of timed slots the two DebugPanel lists render under
 * one header: a human `title` (from `PASS_GROUP_TITLES`, or the raw groupKey as
 * fallback) and the slots that map to it, in draw order.
 */

import type { TimedSlotRow } from './TimedSlotRow';

export type TimedSlotGroup = { readonly title: string; readonly rows: readonly TimedSlotRow[] };
