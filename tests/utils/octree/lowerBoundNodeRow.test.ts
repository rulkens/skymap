import { describe, expect, it } from 'vitest';

import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import { lowerBoundNodeRow } from '../../../src/utils/octree/lowerBoundNodeRow';

// Sorted by (level, morton): (0,3) (0,9) (1,0) (1,8) (1,15) (2,1).
const NODES = {
  count: 6,
  level: Uint8Array.of(0, 0, 1, 1, 1, 2),
  morton: Uint32Array.of(3, 9, 0, 8, 15, 1),
} as unknown as OctreeNodeTable;

describe('lowerBoundNodeRow', () => {
  it('finds the first row at or after a key, level before morton', () => {
    expect(lowerBoundNodeRow(NODES, 1, 8)).toBe(3);
    expect(lowerBoundNodeRow(NODES, 1, 9)).toBe(4);
    expect(lowerBoundNodeRow(NODES, 0, 10)).toBe(2);
    expect(lowerBoundNodeRow(NODES, 0, 0)).toBe(0);
    expect(lowerBoundNodeRow(NODES, 2, 2)).toBe(6);
  });
});
