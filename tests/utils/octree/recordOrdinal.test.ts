import { describe, expect, it } from 'vitest';

import type { OctreeChunk } from '../../../src/@types/octree/OctreeChunk';
import type { OctreeSlotRun } from '../../../src/@types/octree/OctreeSlotRun';
import { poolRecordIndex } from '../../../src/utils/octree/poolRecordIndex';
import { recordOrdinal } from '../../../src/utils/octree/recordOrdinal';

const INDEX_RECORDS = 100;

/** A chunk of `records` catalog ordinals from `recordBase`, its run starting at pool index `poolBase`. */
const run = (
  id: number,
  recordBase: number,
  records: number,
  poolBase: number,
): OctreeSlotRun<{ readonly count: number }> => ({
  chunk: {
    ref: {
      id,
      level: 1,
      morton: id,
      hash: 'h',
      roots: [],
      bytes: 0,
      recordBase,
      records,
      nodes: 1,
    },
  } as unknown as OctreeChunk<{ readonly count: number }>,
  poolBase,
});

// Slot 0 empty; slot 1's 3-record chunk (ordinals 103–105) runs from pool index 164, past slot 2's
// 50-record chunk (ordinals 200–249) at pool index 100: a slot's run is wherever it was allocated.
const SLOTS = [null, run(1, 103, 3, 164), run(2, 200, 50, 100)];

describe('recordOrdinal', () => {
  it("maps an index record to itself and a chunk record through its own slot's run", () => {
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 42)).toBe(42);
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 166)).toBe(105);
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 100)).toBe(200);
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 149)).toBe(249);
  });

  it("returns null in a run's padding past its chunk and in a run nothing holds", () => {
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 167)).toBeNull();
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 150)).toBeNull();
    expect(recordOrdinal(INDEX_RECORDS, SLOTS, 1000)).toBeNull();
  });
});

describe('poolRecordIndex', () => {
  it('inverts recordOrdinal for every resident record', () => {
    let checked = 0;
    for (let pool = 0; pool < 300; pool++) {
      const ordinal = recordOrdinal(INDEX_RECORDS, SLOTS, pool);
      if (ordinal === null) continue;
      expect(poolRecordIndex(INDEX_RECORDS, SLOTS, ordinal)).toBe(pool);
      checked++;
    }
    expect(checked).toBe(INDEX_RECORDS + 3 + 50);
  });

  it('returns null for an ordinal whose chunk is not resident', () => {
    expect(poolRecordIndex(INDEX_RECORDS, SLOTS, 105)).toBe(166);
    expect(poolRecordIndex(INDEX_RECORDS, [null, null], 105)).toBeNull();
  });
});
