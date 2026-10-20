import { describe, expect, it } from 'vitest';

import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { OctreePoolLayout } from '../../../src/@types/octree/OctreePoolLayout';
import { poolRecordIndex } from '../../../src/utils/octree/poolRecordIndex';
import { recordOrdinal } from '../../../src/utils/octree/recordOrdinal';

const ref = (id: number, recordBase: number, records: number): OctreeChunkRef => ({
  id,
  level: 1,
  morton: id,
  hash: 'h',
  roots: [],
  bytes: 0,
  recordBase,
  records,
  nodes: 1,
});

// 100 index records, then two slots of 50: slot 0 empty, slot 1 holds a 3-record chunk based at 103.
const LAYOUT: OctreePoolLayout = { indexRecords: 100, chunkCapacity: 50, slots: 2 };
const SLOTS = [null, ref(1, 103, 3)];

describe('recordOrdinal', () => {
  it('maps an index record to itself and a resident chunk record to its record base + local', () => {
    expect(recordOrdinal(LAYOUT, SLOTS, 42)).toBe(42);
    expect(recordOrdinal(LAYOUT, SLOTS, 152)).toBe(105);
  });

  it("returns null past a chunk's own record count and for an empty slot", () => {
    expect(recordOrdinal(LAYOUT, SLOTS, 153)).toBeNull();
    expect(recordOrdinal(LAYOUT, SLOTS, 100)).toBeNull();
    expect(recordOrdinal(LAYOUT, SLOTS, 100 + 2 * 50)).toBeNull();
  });
});

describe('poolRecordIndex', () => {
  it('inverts recordOrdinal for every resident record', () => {
    const slots = [ref(0, 100, 5), ref(1, 105, 50)];
    const layout = { ...LAYOUT, slots: slots.length };
    for (let pool = 0; pool < layout.indexRecords + layout.slots * layout.chunkCapacity; pool++) {
      const ordinal = recordOrdinal(layout, slots, pool);
      if (ordinal !== null) expect(poolRecordIndex(layout, slots, ordinal)).toBe(pool);
    }
  });

  it('returns null for an ordinal whose chunk is not resident', () => {
    expect(poolRecordIndex(LAYOUT, SLOTS, 105)).toBe(152);
    expect(poolRecordIndex(LAYOUT, [null, null], 105)).toBeNull();
  });
});
