import { describe, expect, it } from 'vitest';

import { starOctreeFromSkst } from '../../../src/utils/star/starOctreeFromSkst';
import { buildStarOctree } from '../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar } from '../../../tools/stars/buildStarOctree';
import {
  lutIndexToAbsMag,
  packStarRecord,
  unpackStarRecord,
  RECORD_BYTES,
} from '../../../src/data/starCatalog/starCatalogFormat';

describe('starOctreeFromSkst', () => {
  it('a v1 aggregate becomes a node whose blob is its record and whose own count is zero', () => {
    // 40 stars in each of two cells: 80 exceeds the fat-leaf capacity, so the root
    // aggregates over two level-0 leaves.
    const stars: OctreeLeafStar[] = [0, 1].flatMap((mortonIndex) =>
      Array.from({ length: 40 }, (_, s) => ({
        mortonIndex,
        offset: [s, 2 * s, 3 * s] as const,
        absMag: 2 + mortonIndex,
        bpRp: 0.5,
      })),
    );
    const cat = buildStarOctree(stars, {
      mortonBitsPerAxis: 1,
      cellEdgePc: 1,
      gridOrigin: [0, 0, 0],
    });
    const octree = starOctreeFromSkst(cat);

    const agg = cat.nodes.findIndex((n) => n.childMask !== 0);
    expect(agg).toBeGreaterThanOrEqual(0);
    expect(cat.nodes.filter((n) => n.childMask === 0)).toHaveLength(2);
    expect(octree.nodes.childMask[agg]).not.toBe(0);
    expect(octree.nodes.ownCount[agg]).toBe(0);
    expect(octree.nodes.blobCount[agg]).toBe(80);
    const v1 = unpackStarRecord(cat.records, cat.nodes[agg]!.firstRecord * RECORD_BYTES);
    expect(octree.records.absMag[octree.nodes.firstRecord[agg]!]).toBe(
      Math.fround(lutIndexToAbsMag(v1.absMagIdx)),
    );
  });

  it('a v1 in-leaf 10-bit offset is rescaled to the 16-bit node box', () => {
    const octree = starOctreeFromSkst({
      starCount: 1,
      nodeCount: 1,
      mortonBitsPerAxis: 1,
      cellEdgePc: 1,
      gridOrigin: [0, 0, 0],
      nodes: [{ mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 1 }],
      records: packStarRecord([1023, 0, 512], 10, 5),
    });
    expect([...octree.records.offset]).toEqual([65472, 0, 32768]);
  });
});
