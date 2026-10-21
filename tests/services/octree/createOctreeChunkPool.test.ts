import { describe, expect, it, vi } from 'vitest';

import { createOctreeChunkPool } from '../../../src/services/octree/createOctreeChunkPool';

// Records per key; runs round up to a power of two of at least 1,024.
const SIZES: Record<string, number> = { a: 1000, b: 1000, c: 2000, d: 4000, e: 1000 };

/** Four chunk slots over 4,096 records: one top run of 4,096. */
function make(slots = 4) {
  const pool = createOctreeChunkPool({ slots, records: 4096, maxRun: 4096 }, (k) => SIZES[k]!);
  const evicted = vi.fn<(key: string) => void>();
  pool.setEvictHandler(evicted);
  return { pool, evicted };
}

describe('createOctreeChunkPool', () => {
  it('places each key in a slot and a run of its own, readable back by the slot', () => {
    const { pool } = make();
    const runs = ['a', 'c', 'b'].map((k) => pool.runStartOf(pool.allocate(k, 1)!));
    expect(runs).toEqual([0, 2048, 1024]);
    expect(pool.allocate('a', 2)).toBe(pool.slotOf('a'));
  });

  it('evicts least recently seen keys until the run fits, then places it in the freed records', () => {
    const { pool, evicted } = make();
    pool.allocate('a', 1);
    pool.allocate('b', 2);
    pool.allocate('c', 3);
    // d needs all 4,096: every older key goes, oldest first.
    expect(pool.runStartOf(pool.allocate('d', 4)!)).toBe(0);
    expect(evicted.mock.calls.map(([k]) => k)).toEqual(['a', 'b', 'c']);
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
    expect(pool.runStartOf(pool.allocate('d', 3)!)).toBe(0);
    expect(pool.occupiedCount()).toBe(1);
  });
});
