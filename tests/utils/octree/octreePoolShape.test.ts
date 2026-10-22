import { describe, expect, it } from 'vitest';

import type { Octree } from '../../../src/@types/octree/Octree';
import { octreePoolShape } from '../../../src/utils/octree/octreePoolShape';

// GLADE's bake: 441 chunks of at most 32,768 records and 2,048 rows.
const GLADE = {
  chunkCount: 441,
  chunkCapacity: 32768,
  chunkNodeCap: 2048,
} as unknown as Octree<{ readonly count: number }>;

describe('octreePoolShape', () => {
  it("holds a tier's records in whole largest-chunk runs and sizes the rows to them", () => {
    // 1,040,000 records round up to 32 runs of 32,768; × 0.33 = 346,030 rows, rounded up to
    // whole 2,048-row top runs.
    expect(octreePoolShape(GLADE, 1_040_000, 0.33)).toEqual({
      slots: 441,
      records: { total: 1_048_576, minRun: 1024, maxRun: 32768 },
      nodes: { total: 169 * 2048, minRun: 64, maxRun: 2048 },
    });
  });

  it('never sizes past the chunks there are, nor past one minimum run of either kind per chunk', () => {
    const tiny = { chunkCount: 3, chunkCapacity: 50, chunkNodeCap: 5 } as typeof GLADE;
    // A 50-record capacity runs in 64s: 128 records hold 2 minimum runs; 5 rows run in 8s.
    expect(octreePoolShape(tiny, 128, 1)).toEqual({
      slots: 2,
      records: { total: 128, minRun: 64, maxRun: 64 },
      nodes: { total: 128, minRun: 8, maxRun: 8 },
    });
    // Rows for one minimum run bind the slots below the records' two.
    expect(octreePoolShape(tiny, 128, 1 / 16).slots).toBe(1);
    // Never more runs than the 3 chunks there are.
    expect(octreePoolShape(tiny, 1_000_000, 1).records.total).toBe(3 * 64);
    expect(octreePoolShape({ ...tiny, chunkCount: 0 }, 512, 1).slots).toBe(0);
  });
});
