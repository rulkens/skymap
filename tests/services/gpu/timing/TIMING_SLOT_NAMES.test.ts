/**
 * TIMING_SLOT_NAMES — pin every (slot, begin-idx, end-idx) tuple from
 * the spec's "Static slot assignment" table.  A typo in the table
 * would mis-map decoded timings to the wrong row in the UI — caught
 * here.
 */

import { describe, it, expect } from 'vitest';
import {
  TIMING_SLOT_NAMES,
  TIMING_QUERY_SET_SIZE,
} from '../../../../src/services/gpu/timing/TIMING_SLOT_NAMES';

describe('TIMING_SLOT_NAMES', () => {
  it('maps every spec-defined slot to the correct begin/end indices', () => {
    expect(TIMING_SLOT_NAMES.get('point-sprites')).toEqual([0, 1]);
    expect(TIMING_SLOT_NAMES.get('procedural-disks')).toEqual([2, 3]);
    expect(TIMING_SLOT_NAMES.get('textured-impostors')).toEqual([4, 5]);
    expect(TIMING_SLOT_NAMES.get('filaments')).toEqual([6, 7]);
    expect(TIMING_SLOT_NAMES.get('scalar-volume')).toEqual([8, 9]);
    expect(TIMING_SLOT_NAMES.get('milky-way')).toEqual([10, 11]);
    expect(TIMING_SLOT_NAMES.get('tone-map')).toEqual([12, 13]);
    expect(TIMING_SLOT_NAMES.get('ui-overlay')).toEqual([14, 15]);
    expect(TIMING_SLOT_NAMES.get('pick')).toEqual([16, 17]);
  });

  it('reserves slots 18-31 (query set sized 32, 9 in use)', () => {
    expect(TIMING_QUERY_SET_SIZE).toBe(32);
    expect(TIMING_SLOT_NAMES.size).toBe(9);
  });

  it('never assigns the same index to two slots', () => {
    const seen = new Set<number>();
    for (const [, [begin, end]] of TIMING_SLOT_NAMES) {
      expect(seen.has(begin)).toBe(false);
      expect(seen.has(end)).toBe(false);
      seen.add(begin);
      seen.add(end);
    }
  });
});
