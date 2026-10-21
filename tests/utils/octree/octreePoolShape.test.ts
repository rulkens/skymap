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
  it("keeps a tier's record memory and sizes the rows to it at the bake's rows per record", () => {
    // 32 × 32,768 records; × 0.33 = 346,030 rows, rounded up to whole 2,048-row top runs.
    expect(octreePoolShape(GLADE, 32, 0.33)).toEqual({
      slots: 441,
      records: { total: 1_048_576, minRun: 1024, maxRun: 32768 },
      nodes: { total: 169 * 2048, minRun: 64, maxRun: 2048 },
    });
  });

  it('never sizes past the chunks there are, nor past one minimum run of either kind per chunk', () => {
    const tiny = { chunkCount: 3, chunkCapacity: 50, chunkNodeCap: 5 } as typeof GLADE;
    // A 50-record capacity runs in 64s, 2 of them hold 2 minimum runs; 5 rows run in 8s.
    expect(octreePoolShape(tiny, 2, 1)).toEqual({
      slots: 2,
      records: { total: 128, minRun: 64, maxRun: 64 },
      nodes: { total: 128, minRun: 8, maxRun: 8 },
    });
    // Rows for one minimum run bind the slots below the records' two.
    expect(octreePoolShape(tiny, 2, 1 / 16).slots).toBe(1);
    expect(octreePoolShape({ ...tiny, chunkCount: 0 }, 8, 1).slots).toBe(0);
  });
});
