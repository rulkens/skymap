/**
 * subtreeStarCounts — the runtime derivation the flux-glow shader relies on.
 *
 * An aggregate record stores its subtree's MEAN star flux, so the shader
 * rebuilds the summed light by multiplying by the subtree's leaf-star count.
 * That count is not on disk — it is derived from the node table — so this test
 * pins the derivation over a real (built) octree: every childless node (a
 * level-0 cell OR a fat leaf above it) equals its own record count, every
 * aggregate equals the sum of the childless leaves beneath it, and the root
 * equals the whole population. The seed is keyed on `childMask === 0`, NOT
 * `level === 0`, so a fat leaf at level > 0 seeds from its recordCount.
 */
import { describe, expect, it } from 'vitest';
import { buildStarOctree, STAR_LEAF_CAPACITY } from '../../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../../tools/stars/buildStarOctree';
import { subtreeStarCounts } from '../../../../../src/services/gpu/renderers/starCatalog/subtreeStarCounts';

const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };

function sorted(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

describe('subtreeStarCounts', () => {
  it('seeds childless leaves (level-0 AND fat) from recordCount and sums aggregates', () => {
    // A dense cell (capacity+1 stars) that stays a level-0 leaf, plus a distant
    // sparse pair (cells 8, 9) whose 4-star subtree folds into a fat leaf at
    // level 1 — so the catalog has a level-0 leaf, a fat leaf, and aggregates.
    const dense: OctreeLeafStar[] = [];
    for (let s = 0; s < STAR_LEAF_CAPACITY + 1; s++) {
      dense.push({ mortonIndex: 0, offset: [s % 1024, 1, 2], absMag: 5, bpRp: 0.3 });
    }
    const sparse: OctreeLeafStar[] = [
      { mortonIndex: 8, offset: [100, 200, 300], absMag: 4, bpRp: 0.5 },
      { mortonIndex: 8, offset: [700, 40, 900], absMag: 4, bpRp: 0.5 },
      { mortonIndex: 9, offset: [10, 500, 30], absMag: 4, bpRp: 0.5 },
      { mortonIndex: 9, offset: [900, 5, 600], absMag: 4, bpRp: 0.5 },
    ];
    const catalog = buildStarOctree(sorted([...dense, ...sparse]), GRID);
    const counts = subtreeStarCounts(catalog);

    // The fixture really contains a fat leaf (childMask 0 above level 0).
    const fatLeafIdx = catalog.nodes.findIndex((n) => n.level > 0 && n.childMask === 0);
    expect(fatLeafIdx).toBeGreaterThanOrEqual(0);

    catalog.nodes.forEach((node, i) => {
      if (node.childMask === 0) {
        // Any childless node (level-0 cell or fat leaf) seeds from its own count.
        expect(counts[i]).toBe(node.recordCount);
      }
    });
    // The fat leaf's count is its folded subtree total (4), from recordCount.
    expect(counts[fatLeafIdx]).toBe(4);
    // The root (last node) covers the whole catalog.
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
