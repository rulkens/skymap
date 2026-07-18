import { describe, expect, it } from 'vitest';
import { buildStarOctree, STAR_LEAF_CAPACITY } from '../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
  unpackStarRecord,
  RECORD_BYTES,
} from '../../../src/data/starCatalog/starCatalogFormat';

// A leaf-cell edge of 1 pc with a zero grid origin makes grid coordinates read
// directly as parsecs, so reconstructions below are in the same frame.
const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };

/** Ascending-Morton sort — the build's precondition. */
function sorted(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

describe('buildStarOctree', () => {
  it('collapses a whole catalog of ≤ STAR_LEAF_CAPACITY stars into one root fat leaf', async () => {
    // Three stars in two adjacent cells — well under the leaf capacity — fold
    // up into a SINGLE fat leaf: childMask 0, holding every real record, sitting
    // above level 0 (the merge happened), with no aggregate anywhere.
    const stars: OctreeLeafStar[] = [
      { mortonIndex: 0, offset: [100, 200, 300], absMag: 2, bpRp: 0.5 },
      { mortonIndex: 0, offset: [500, 500, 500], absMag: 3, bpRp: 1.0 },
      { mortonIndex: 1, offset: [10, 20, 30], absMag: 4, bpRp: 1.5 },
    ];

    const cat = buildStarOctree(sorted(stars), GRID);

    expect(cat.starCount).toBe(3);
    expect(cat.nodes.length).toBe(1);
    const root = cat.nodes[0]!;
    expect(root.childMask).toBe(0); // a fat leaf, not an aggregate
    expect(root.level).toBeGreaterThan(0); // merged above the finest level
    expect(root.recordCount).toBe(3); // real stars, not a single mip record
    expect(root.firstRecord).toBe(0);
    expect(cat.records.length).toBe(3 * RECORD_BYTES); // no aggregate records

    // Survives the format's encode/decode round-trip — ties the octree assembly
    // to the byte contract without restating offsets.
    const decoded = await decodeStarCatalog(await encodeStarCatalog(cat));
    expect(decoded.nodes).toEqual(cat.nodes);
    expect(decoded.records).toEqual(cat.records);
  });

  it('keeps a dense cell (> capacity) a level-0 leaf and folds a sparse region into a fat leaf', () => {
    // A dense core plus a distant sparse pair, laid out so:
    //   • cell 0 holds capacity+1 stars — it CANNOT split, so it stays a
    //     level-0 leaf and forces its ancestors to aggregate;
    //   • cells 8 (grid 2,0,0) and 9 (grid 3,0,0) hold 2 stars each; their
    //     shared level-1 parent (morton 1) totals 4 ≤ capacity → a FAT LEAF,
    //     whose two finest cells vanish from the node table;
    //   • the level-2 root aggregates the dense chain and the fat leaf.
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
    const cat = buildStarOctree(sorted([...dense, ...sparse]), GRID);

    expect(cat.starCount).toBe(STAR_LEAF_CAPACITY + 5);

    // Dense cell survives as a level-0 leaf holding all its stars.
    const denseNode = cat.nodes.find((n) => n.level === 0 && n.mortonIndex === 0)!;
    expect(denseNode).toBeDefined();
    expect(denseNode.childMask).toBe(0);
    expect(denseNode.recordCount).toBe(STAR_LEAF_CAPACITY + 1);

    // The sparse pair folded into ONE fat leaf at level 1, morton 1: childMask 0,
    // recordCount = the 4-star subtree total.
    const fatLeaf = cat.nodes.find((n) => n.level === 1 && n.mortonIndex === 1)!;
    expect(fatLeaf).toBeDefined();
    expect(fatLeaf.childMask).toBe(0);
    expect(fatLeaf.recordCount).toBe(4);

    // The fat leaf's finest cells (level-0 mortons 8 and 9) do NOT appear —
    // they folded away, which is the whole point of the merge.
    expect(cat.nodes.some((n) => n.level === 0 && (n.mortonIndex === 8 || n.mortonIndex === 9))).toBe(
      false,
    );

    // A real aggregate spans the dense chain and the fat leaf (childMask != 0).
    expect(cat.nodes.some((n) => n.childMask !== 0)).toBe(true);

    // Node order is ascending (level, morton); the root (last node) is unique
    // at the top level.
    const keys = cat.nodes.map((n) => [n.level, n.mortonIndex] as const);
    const sortedKeys = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(keys).toEqual(sortedKeys);

    // Each folded star's reconstructed position lands within one fat-leaf offset
    // unit (× a small slack for the per-level halving) of its pre-merge value.
    // Records keep input order per cell, so the fat leaf's four records are
    // [cell-8 star A, cell-8 star B, cell-9 star A, cell-9 star B].
    const boxCells = 2 ** fatLeaf.level; // fat-leaf box edge in leaf cells
    const tol = (boxCells / 1024) * 2;
    const expected = [
      // cell 8 = grid (2,0,0): pre-merge world = grid + offset/1024.
      [2 + 100 / 1024, 0 + 200 / 1024, 0 + 300 / 1024],
      [2 + 700 / 1024, 0 + 40 / 1024, 0 + 900 / 1024],
      // cell 9 = grid (3,0,0).
      [3 + 10 / 1024, 0 + 500 / 1024, 0 + 30 / 1024],
      [3 + 900 / 1024, 0 + 5 / 1024, 0 + 600 / 1024],
    ];
    // Fat-leaf box origin in grid cells: mortonDecode3(1) · boxCells = (1,0,0)·2.
    const boxOrigin = [1 * boxCells, 0, 0];
    for (let r = 0; r < 4; r++) {
      const { offset } = unpackStarRecord(cat.records, (fatLeaf.firstRecord + r) * RECORD_BYTES);
      for (let axis = 0; axis < 3; axis++) {
        const recon = boxOrigin[axis]! + (offset[axis]! / 1024) * boxCells;
        expect(Math.abs(recon - expected[r]![axis]!)).toBeLessThanOrEqual(tol);
      }
    }
  });

  it('throws on input that is not sorted ascending by Morton code', () => {
    // Descending codes would silently split one cell into duplicate leaf
    // nodes; the build refuses instead of producing a structurally broken
    // (but byte-clean) octree.
    const stars: OctreeLeafStar[] = [
      { mortonIndex: 1, offset: [10, 20, 30], absMag: 4, bpRp: 1.5 },
      { mortonIndex: 0, offset: [100, 200, 300], absMag: 2, bpRp: 0.5 },
    ];
    expect(() => buildStarOctree(stars, GRID)).toThrow(/ascending-Morton-order precondition/);
  });
});
