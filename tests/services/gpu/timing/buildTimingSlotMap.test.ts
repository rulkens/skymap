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

  it('throws on a duplicate name instead of silently colliding two slots onto one index pair', () => {
    // The exact regression this restores: TIMED_SLOTS once carried 'planets'
    // 26 times (one per body-row capacity slot) with no per-row distinction,
    // so every duplicate silently overwrote the same two query indices.
    expect(() => buildTimingSlotMap(['a', 'b', 'a'])).toThrow(/duplicate/i);
  });
});
