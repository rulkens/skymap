/**
 * PerfSample — one GPU timing reading: how many milliseconds a single named
 * render slot cost on one measured frame.
 *
 * The harness collects these in bulk (`collectTimings(frames)` returns a flat
 * `PerfSample[]`) and aggregates downstream — median, p90, per-slot rollups,
 * per-frame totals — so the wire shape stays deliberately atomic: no
 * pre-bucketed maps. Each reading is still ONE slot on ONE frame costing ONE
 * ms; `frame` is a first-class grouping COORDINATE on that atomic sample, NOT a
 * pre-aggregation. The consumer chooses the axis: `statsOf` groups by `slot`,
 * `frameTotals` groups by `frame` (the honest per-frame GPU cost needs it —
 * summing the slots present on each frame, then taking a median, is the only
 * correct total; the sum of per-slot medians mixes frames and inflates). An
 * earlier revision claimed the frame index was unnecessary — that was
 * under-design: with only `{ slot, ms }` there is no way to reconstruct which
 * readings belong to the same frame, so no honest per-frame total exists.
 * `frame` matches `TimingSlotName`'s open-string nature (a slot that only
 * exists when `?gpuTimings` splits passes still round-trips as data).
 */

import type { TimingSlotName } from '../gpu/timing/TimingSlotName';

export type PerfSample = { slot: TimingSlotName; ms: number; frame: number };
