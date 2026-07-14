import { describe, expect, it } from 'vitest';
import { buildStarOctree } from '../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../src/data/starCatalog/starCatalogFormat';

describe('buildStarOctree', () => {
  it('builds nodes over a handful of synthetic stars', async () => {
    // Three stars across two adjacent leaf cells: Morton 0 (two stars) and
    // Morton 1 (one star). x rides the lowest interleave bit, so cells 0 and 1
    // are x-neighbours sharing the parent (0>>3 === 1>>3 === 0), which yields
    // exactly one level-1 aggregate over both.
    const stars: OctreeLeafStar[] = [
      { mortonIndex: 0, offset: [100, 200, 300], absMag: 2, bpRp: 0.5 },
      { mortonIndex: 0, offset: [500, 500, 500], absMag: 3, bpRp: 1.0 },
      { mortonIndex: 1, offset: [10, 20, 30], absMag: 4, bpRp: 1.5 },
    ];
    const grid: StarOctreeGrid = {
      mortonBitsPerAxis: 9,
      cellEdgePc: 1.0,
      gridOrigin: [0, 0, 0],
    };

    const cat = buildStarOctree(stars, grid);

    // starCount counts only leaf star records, not aggregates.
    expect(cat.starCount).toBe(3);

    const leaves = cat.nodes.filter((n) => n.level === 0);
    const aggregates = cat.nodes.filter((n) => n.level > 0);
    expect(leaves.length).toBe(2);
    expect(aggregates.length).toBe(1);

    // Every aggregate is a single flux-mip record standing in for a subtree.
    for (const agg of aggregates) {
      expect(agg.recordCount).toBe(1);
      expect(agg.level).toBeGreaterThan(0);
      // Descent bits: both octants 0 and 1 are present → mask 0b011.
      expect(agg.childMask).toBe(0b011);
    }

    // Leaf nodes are emitted in non-decreasing Morton order.
    for (let k = 1; k < leaves.length; k++) {
      expect(leaves[k]!.mortonIndex).toBeGreaterThanOrEqual(leaves[k - 1]!.mortonIndex);
    }

    // Record-blob layout: all leaf star records first, then one record per
    // aggregate — so the leaves' recordCounts account for every star, and the
    // first aggregate record starts exactly at the leaf/aggregate boundary.
    const leafRecordTotal = leaves.reduce((sum, leaf) => sum + leaf.recordCount, 0);
    expect(leafRecordTotal).toBe(cat.starCount);
    expect(aggregates[0]!.firstRecord).toBe(cat.starCount);

    // The assembled catalog survives the format's encode/decode round-trip —
    // ties the octree assembly to the byte contract without restating offsets.
    const decoded = await decodeStarCatalog(await encodeStarCatalog(cat));
    expect(decoded.starCount).toBe(cat.starCount);
    expect(decoded.nodeCount).toBe(cat.nodeCount);
    expect(decoded.mortonBitsPerAxis).toBe(grid.mortonBitsPerAxis);
    expect(decoded.nodes).toEqual(cat.nodes);
    expect(decoded.records).toEqual(cat.records);
  });

  it('throws on input that is not sorted ascending by Morton code', () => {
    // Descending codes would silently split one cell into duplicate leaf
    // nodes; the build refuses instead of producing a structurally broken
    // (but byte-clean) octree.
    const stars: OctreeLeafStar[] = [
      { mortonIndex: 1, offset: [10, 20, 30], absMag: 4, bpRp: 1.5 },
      { mortonIndex: 0, offset: [100, 200, 300], absMag: 2, bpRp: 0.5 },
    ];
    const grid: StarOctreeGrid = {
      mortonBitsPerAxis: 9,
      cellEdgePc: 1.0,
      gridOrigin: [0, 0, 0],
    };

    expect(() => buildStarOctree(stars, grid)).toThrow(/ascending-Morton-order precondition/);
  });
});
