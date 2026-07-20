/**
 * PerfSample — one GPU timing reading: how many milliseconds a single named
 * render slot cost on one measured frame.
 *
 * The harness collects these in bulk (`collectTimings(frames)` returns a flat
 * `PerfSample[]`) and aggregates downstream — median, p90, per-slot rollups —
 * so the wire shape stays deliberately atomic: no pre-bucketed maps, no frame
 * index baked in. Keeping each reading a bare `{ slot, ms }` pair lets the
 * consumer choose how to group without the producer having pre-committed to one
 * aggregation, and matches `TimingSlotName`'s open-string nature (a slot that
 * only exists when `?gpuTimings` splits passes still round-trips as data).
 */

import type { TimingSlotName } from '../gpu/timing/TimingSlotName';

export type PerfSample = { slot: TimingSlotName; ms: number };
