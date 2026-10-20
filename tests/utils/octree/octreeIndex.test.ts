import { describe, expect, it } from 'vitest';

import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { OctreeGrid } from '../../../src/@types/octree/OctreeGrid';
import { NO_CHUNK_REF } from '../../../src/data/octree/octreeFormat';
import { octreeIndex } from '../../../src/utils/octree/octreeIndex';

const GRID = { bits: 4, origin: [0, 0, 0], cellEdge: 1 } as unknown as OctreeGrid;

// Rows (level, morton, childMask, chunkRef), sorted: a leaf, its childful parent (no root below),
// a chunk root, a childless level-1 row, and the root over the first two level-1 rows.
const ROWS = [
  [0, 0, 0, NO_CHUNK_REF],
  [1, 0, 0b1, NO_CHUNK_REF],
  [1, 1, 0xff, 3],
  [1, 2, 0, NO_CHUNK_REF],
  [2, 0, 0b11, NO_CHUNK_REF],
] as const;

const NODES: OctreeNodeTable = {
  count: ROWS.length,
  level: Uint8Array.from(ROWS.map((r) => r[0])),
  morton: Uint32Array.from(ROWS.map((r) => r[1])),
  childMask: Uint8Array.from(ROWS.map((r) => r[2])),
  firstRecord: new Uint32Array(ROWS.length),
  ownCount: new Uint32Array(ROWS.length),
  blobCount: new Uint32Array(ROWS.length),
  chunkRef: Uint32Array.from(ROWS.map((r) => r[3])),
};

describe('octreeIndex', () => {
  it('flags a row that is a chunk root or holds one below it in its object', () => {
    expect([...octreeIndex(NODES, GRID).holdsChunkRoot]).toEqual([0, 0, 1, 0, 1]);
  });
});
