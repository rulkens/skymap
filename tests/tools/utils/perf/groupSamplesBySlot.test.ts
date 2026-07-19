import { describe, expect, it } from 'vitest';

import { groupSamplesBySlot } from '../../../../tools/utils/perf/groupSamplesBySlot';

describe('groupSamplesBySlot', () => {
  it('buckets ms by slot, preserving arrival order within each bucket', () => {
    const grouped = groupSamplesBySlot([
      { slot: 'a', ms: 1 },
      { slot: 'b', ms: 2 },
      { slot: 'a', ms: 3 },
    ]);

    expect(grouped.get('a')).toEqual([1, 3]);
    expect(grouped.get('b')).toEqual([2]);
  });
});
