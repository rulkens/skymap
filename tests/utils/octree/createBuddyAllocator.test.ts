import { describe, expect, it } from 'vitest';

import { createBuddyAllocator } from '../../../src/utils/octree/createBuddyAllocator';

// Two top blocks of 8 records, runs of at least 2.
const make = () => createBuddyAllocator(16, 8, 2);

describe('createBuddyAllocator', () => {
  it('rounds a request up to a power-of-two run of at least the minimum, aligned to its size', () => {
    const a = make();
    expect(a.runSize(1)).toBe(2);
    expect(a.runSize(3)).toBe(4);
    expect(a.runSize(8)).toBe(8);
    const starts = [a.alloc(3), a.alloc(1), a.alloc(1), a.alloc(5)];
    expect(starts).toEqual([0, 4, 6, 8]);
  });

  it('refuses when no free aligned run is large enough, even with enough records free in total', () => {
    const a = make();
    const runs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => a.alloc(2)!);
    // Free every other run: 8 records free, but no two adjacent runs are buddies.
    for (const start of runs.filter((_, k) => k % 2 === 0)) a.free(start);
    expect(a.alloc(4)).toBeNull();
    expect(a.alloc(2)).not.toBeNull();
  });

  it('coalesces freed buddies back into the run they split from', () => {
    const a = make();
    const x = a.alloc(2)!;
    const y = a.alloc(2)!;
    const z = a.alloc(4)!;
    expect(a.alloc(8)).toBe(8);
    expect(a.alloc(8)).toBeNull();
    a.free(y);
    a.free(z);
    expect(a.alloc(8)).toBeNull();
    a.free(x);
    expect(a.alloc(8)).toBe(0);
  });

  it('throws on a run larger than a top block and on freeing a start it never handed out', () => {
    const a = make();
    expect(() => a.alloc(9)).toThrow();
    expect(() => a.free(2)).toThrow();
  });
});
