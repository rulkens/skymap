/**
 * frameTotals — grouping a flat `PerfSample[]` by frame and summing each frame's
 * per-slot costs into one honest per-frame GPU total.
 *
 * The one assertion that matters here: the sum is taken PER FRAME (across the
 * slots present on that frame), not per slot. A frame whose slot set differs
 * from its neighbours (a slot absent on one frame) proves the grouping is by
 * frame — a per-slot rollup would smear that missing slot across frames.
 */

import { describe, it, expect } from 'vitest';

import { frameTotals } from '../../../../tools/utils/perf/frameTotals';
import type { PerfSample } from '../../../../src/@types/perf/PerfSample';

describe('frameTotals', () => {
  it('sums each frame across its slots and returns totals in ascending frame order', () => {
    // Fed deliberately out of frame order to prove the ascending-order contract.
    // frame 1 carries only slot A (slot B absent) — a per-slot rollup could not
    // reproduce its 4.0 total.
    const samples: PerfSample[] = [
      { slot: 'A', ms: 0.5, frame: 2 },
      { slot: 'A', ms: 1.0, frame: 0 },
      { slot: 'B', ms: 2.0, frame: 0 },
      { slot: 'A', ms: 4.0, frame: 1 },
      { slot: 'B', ms: 1.5, frame: 2 },
    ];

    // frame 0 → 1.0 + 2.0 = 3.0; frame 1 → 4.0; frame 2 → 0.5 + 1.5 = 2.0.
    expect(frameTotals(samples)).toEqual([3.0, 4.0, 2.0]);
  });

  it('returns an empty array for no samples', () => {
    expect(frameTotals([])).toEqual([]);
  });
});
