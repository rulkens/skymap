import { describe, expect, it } from 'vitest';

import type { Octree } from '../../../src/@types/octree/Octree';
import { octreePoolShape } from '../../../src/utils/octree/octreePoolShape';

// GLADE's bake: 441 chunks of at most 32,768 records, 1,665,935 records in all (3,778 per chunk).
const GLADE = {
  chunkCount: 441,
  chunkCapacity: 32768,
  recordCount: 1_665_935,
} as unknown as Octree<{ readonly count: number }>;

describe('octreePoolShape', () => {
  it("keeps a tier's record memory (slots × chunk capacity) and sizes the chunk slots to it", () => {
    // 32 × 32,768 records hold 1,048,576 / 3,778 = 277.5 mean chunks.
    expect(octreePoolShape(GLADE, 32)).toEqual({ slots: 278, records: 1_048_576, maxRun: 32768 });
    // 64 tiers' worth hold more mean chunks than the catalog has.
    expect(octreePoolShape(GLADE, 64)).toEqual({ slots: 441, records: 2_097_152, maxRun: 32768 });
  });

  it('never sizes past the chunks there are, nor past one minimum run per chunk', () => {
    const tiny = { chunkCount: 3, chunkCapacity: 50, recordCount: 0 } as typeof GLADE;
    // A 50-record capacity runs in 64s; 2 of them hold 2 minimum runs of 64.
    expect(octreePoolShape(tiny, 2)).toEqual({ slots: 2, records: 128, maxRun: 64 });
    expect(octreePoolShape({ ...tiny, chunkCount: 0 }, 8).slots).toBe(0);
  });
});
