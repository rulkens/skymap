/**
 * groupSamplesBySlot — pivot a flat `PerfSample[]` into per-slot `ms` arrays.
 *
 * WHY the producer stays flat and this does the bucketing: `collectTimings`
 * emits a bare `{ slot, ms }` stream so it never has to pre-commit to one
 * aggregation (see `PerfSample`'s header). The downstream median/p95 rollups
 * need the readings grouped by slot, so that pivot happens here, once.
 *
 * Arrival order is preserved WITHIN each bucket: the caller feeds frames in
 * chronological order and later stages (percentile, a "first vs last frame"
 * warm-up diff) rely on the array reading oldest → newest. A `Map` also
 * preserves first-seen key order, so iterating the result reflects the order
 * slots first appeared in the stream.
 */
import type { PerfSample } from '../../../src/@types/perf/PerfSample';
import type { TimingSlotName } from '../../../src/@types/gpu/timing/TimingSlotName';

export function groupSamplesBySlot(
  samples: readonly PerfSample[],
): Map<TimingSlotName, number[]> {
  const grouped = new Map<TimingSlotName, number[]>();
  for (const { slot, ms } of samples) {
    const bucket = grouped.get(slot);
    if (bucket) bucket.push(ms);
    else grouped.set(slot, [ms]);
  }
  return grouped;
}
