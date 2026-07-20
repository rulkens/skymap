/**
 * frameTotals — collapse a flat `PerfSample[]` into one honest GPU cost per
 * frame: for each frame, the sum of every slot that ran on it.
 *
 * WHY this exists as its own step: the per-frame total is the number that
 * answers "how much of the frame budget did the GPU passes eat", and there is
 * exactly one correct way to compute it — sum the slots WITHIN each frame, then
 * take the median/p90 of those per-frame sums downstream. The tempting shortcut
 * — sum the per-slot medians `statsOf` already produces — is statistically
 * wrong: each slot's median comes from a DIFFERENT frame (the frame where that
 * slot happened to sit at its median), so their sum describes a frame that
 * never rendered and systematically over-counts. Grouping by `frame` first is
 * the only way to keep the samples that share a frame together, which is why
 * `PerfSample` carries a `frame` coordinate at all.
 *
 * The returned totals are in ascending frame order so a caller can pass them
 * straight to `median`/`percentile` (order-independent) or print them as a
 * time series without re-sorting.
 */

import type { PerfSample } from '../../../src/@types/perf/PerfSample';

export function frameTotals(samples: readonly PerfSample[]): number[] {
  const byFrame = new Map<number, number>();
  for (const { frame, ms } of samples) {
    byFrame.set(frame, (byFrame.get(frame) ?? 0) + ms);
  }
  return [...byFrame.keys()].sort((a, b) => a - b).map((frame) => byFrame.get(frame)!);
}
