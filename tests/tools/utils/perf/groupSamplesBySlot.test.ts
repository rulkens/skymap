import { describe, expect, it } from 'vitest';

import { groupSamplesBySlot } from '../../../../tools/utils/perf/groupSamplesBySlot';

describe('groupSamplesBySlot', () => {
  it('buckets ms by slot, preserving arrival order within each bucket', () => {
    // `frame` is required on PerfSample but irrelevant to a per-slot rollup;
    // distinct values here confirm grouping ignores it.
    const grouped = groupSamplesBySlot([
      { slot: 'a', ms: 1, frame: 0 },
      { slot: 'b', ms: 2, frame: 0 },
      { slot: 'a', ms: 3, frame: 1 },
    ]);

    expect(grouped.get('a')).toEqual([1, 3]);
    expect(grouped.get('b')).toEqual([2]);
  });
});
