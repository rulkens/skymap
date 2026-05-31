/**
 * buildTimingSlotMap — pure-function unit coverage.
 *
 * Verifies the [2i, 2i+1] index-pair allocation that lets the
 * gpuTimingService size its query set and write timestamps without any
 * hand-maintained slot table.
 */

import { describe, it, expect } from 'vitest';
import { buildTimingSlotMap } from '../../../../src/services/gpu/timing/buildTimingSlotMap';

describe('buildTimingSlotMap', () => {
  it('assigns each name the contiguous [2i, 2i+1] index pair in order', () => {
    const map = buildTimingSlotMap(['a', 'b', 'c']);
    expect(map.get('a')).toEqual([0, 1]);
    expect(map.get('b')).toEqual([2, 3]);
    expect(map.get('c')).toEqual([4, 5]);
  });

  it('returns an empty map for an empty list', () => {
    expect(buildTimingSlotMap([]).size).toBe(0);
  });

  it('produces a map whose size equals the input length', () => {
    const names = ['point-sprites', 'filaments', 'tone-map', 'ui-overlay', 'pick'];
    const map = buildTimingSlotMap(names);
    expect(map.size).toBe(names.length);
    // Highest index used is the last slot's end index — the caller sizes
    // the query set to names.length * 2, so this must stay below it.
    const lastEnd = map.get('pick')![1];
    expect(lastEnd).toBe(names.length * 2 - 1);
  });
});
