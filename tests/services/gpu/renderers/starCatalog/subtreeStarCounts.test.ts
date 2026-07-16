/**
 * subtreeStarCounts — the runtime derivation the flux-glow shader relies on.
 *
 * An aggregate record stores its subtree's MEAN star flux, so the shader
 * rebuilds the summed light by multiplying by the subtree's leaf-star count.
 * That count is not on disk — it is derived from the node table — so this test
 * pins the derivation over a real (built) octree: every leaf equals its own
 * record count, every aggregate equals the sum of the leaves beneath it, and
 * the root equals the whole population.
 */
import { describe, expect, it } from 'vitest';
import { buildStarOctree } from '../../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../../tools/stars/buildStarOctree';
import { subtreeStarCounts } from '../../../../../src/services/gpu/renderers/starCatalog/subtreeStarCounts';

const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };

describe('subtreeStarCounts', () => {
  it('sums leaf star counts up the aggregate pyramid', () => {
    // Cell 0 (Morton 0) holds two stars, cell 1 (Morton 1) holds one. Cells 0
    // and 1 are x-neighbours sharing the level-1 parent (0>>3 === 1>>3), so the
    // catalog is two leaves under one aggregate.
    const stars: OctreeLeafStar[] = [
      { mortonIndex: 0, offset: [100, 200, 300], absMag: 2, bpRp: 0.5 },
      { mortonIndex: 0, offset: [500, 500, 500], absMag: 3, bpRp: 1.0 },
      { mortonIndex: 1, offset: [10, 20, 30], absMag: 4, bpRp: 1.5 },
    ];
    const catalog = buildStarOctree(stars, GRID);
    const counts = subtreeStarCounts(catalog);

    catalog.nodes.forEach((node, i) => {
      if (node.level === 0) {
        // A leaf's count is exactly its real-star record count.
        expect(counts[i]).toBe(node.recordCount);
      } else {
        // An aggregate's count is the subtree total — here every non-leaf node
        // covers all three stars (single aggregate over the two leaves).
        expect(counts[i]).toBe(catalog.starCount);
      }
    });

    // The root (last node, per the layout invariant) covers the whole catalog.
    expect(counts[catalog.nodes.length - 1]).toBe(catalog.starCount);
  });

  it('memoises per catalog identity (same array reference)', () => {
    const catalog = buildStarOctree(
      [{ mortonIndex: 0, offset: [1, 1, 1], absMag: 3, bpRp: 0.9 }],
      GRID,
    );
    expect(subtreeStarCounts(catalog)).toBe(subtreeStarCounts(catalog));
  });
});
