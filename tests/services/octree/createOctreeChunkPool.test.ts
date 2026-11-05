import { describe, expect, it, vi } from 'vitest';

import { createOctreeChunkPool } from '../../../src/services/octree/createOctreeChunkPool';

// Records and rows per key; record runs round up to a power of two of at least 1,024, row runs of 64.
const SIZES: Record<string, { records: number; nodes: number }> = {
  a: { records: 1000, nodes: 10 },
  b: { records: 1000, nodes: 10 },
  c: { records: 2000, nodes: 10 },
  d: { records: 4000, nodes: 10 },
  e: { records: 1000, nodes: 10 },
  // Few records, but every row the pool has.
  f: { records: 10, nodes: 256 },
};

/** Four chunk slots over 4,096 records (one top run) and 256 rows (one top run). */
function make(slots = 4) {
  const pool = createOctreeChunkPool(
    {
      slots,
      records: { total: 4096, minRun: 1024, maxRun: 4096 },
      nodes: { total: 256, minRun: 64, maxRun: 256 },
    },
    (k) => SIZES[k]!,
  );
  const evicted = vi.fn<(key: string) => void>();
  pool.setEvictHandler(evicted);
  return { pool, evicted };
}

describe('createOctreeChunkPool', () => {
  it('places each key in a slot and a run of its own, readable back by the slot', () => {
    const { pool } = make();
    const runs = ['a', 'c', 'b'].map((k) => pool.runsOf(pool.allocate(k, 1)!).records);
    expect(runs).toEqual([0, 2048, 1024]);
    expect(pool.allocate('a', 2)).toBe(pool.slotOf('a'));
  });

  it('evicts least recently seen keys until the run fits, then places it in the freed records', () => {
    const { pool, evicted } = make();
    pool.allocate('a', 1);
    pool.allocate('b', 2);
    pool.allocate('c', 3);
    // d needs all 4,096: every older key goes, oldest first.
    expect(pool.runsOf(pool.allocate('d', 4)!).records).toBe(0);
    expect(evicted.mock.calls.map(([k]) => k)).toEqual(['a', 'b', 'c']);
  });

  it('places each key in a row run of its own too, and evicts for rows when records are free', () => {
    const { pool, evicted } = make();
    expect(['a', 'b'].map((k) => pool.runsOf(pool.allocate(k, 1)!).nodes)).toEqual([0, 64]);
    // f's 256 rows take the whole row span: both older keys go though records are free.
    expect(pool.runsOf(pool.allocate('f', 2)!)).toEqual({ records: 0, nodes: 0 });
    expect(evicted.mock.calls.map(([k]) => k)).toEqual(['a', 'b']);
  });

  it('evicts for a slot when records are free but every slot is taken', () => {
    const { pool, evicted } = make(2);
    pool.allocate('a', 1);
    pool.allocate('b', 2);
    expect(pool.allocate('e', 3)).not.toBeNull();
    expect(evicted.mock.calls.map(([k]) => k)).toEqual(['a']);
  });

  it('refuses, keeping it, rather than evict a key seen this frame', () => {
    const { pool, evicted } = make();
    pool.allocate('c', 1);
    pool.allocate('a', 2);
    pool.touch('c', 2);
    expect(pool.allocate('d', 2)).toBeNull();
    expect(evicted).not.toHaveBeenCalled();
    expect(pool.occupiedCount()).toBe(2);
  });

  it('frees the slot and run of a key evicted by name, also from inside the evict handler', () => {
    const { pool } = make();
    pool.allocate('a', 1);
    pool.allocate('b', 1);
    pool.allocate('c', 2);
    // Evicting a takes b with it, as a parent chunk takes its children.
    pool.setEvictHandler((k) => k === 'a' && pool.evict('b'));
    pool.evict('c');
    expect(pool.runsOf(pool.allocate('d', 3)!).records).toBe(0);
    expect(pool.occupiedCount()).toBe(1);
  });
});
