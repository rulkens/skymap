import { describe, expect, it } from 'vitest';
import { resolveStarRecord } from '../../../../src/services/engine/helpers/resolveStarRecord';
import { buildStarOctree, STAR_LEAF_CAPACITY } from '../../../../tools/stars/buildStarOctree';
import type { OctreeLeafStar, StarOctreeGrid } from '../../../../tools/stars/buildStarOctree';
import {
  encodeStarCatalog,
  decodeStarCatalog,
} from '../../../../src/data/starCatalog/starCatalogFormat';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

// A 1 pc leaf edge with a zero grid origin makes grid coordinates read directly
// as parsecs, so the reconstructions below are hand-computable in the same frame.
const GRID: StarOctreeGrid = { mortonBitsPerAxis: 9, cellEdgePc: 1.0, gridOrigin: [0, 0, 0] };
const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC;

/** Ascending-Morton sort — buildStarOctree's precondition. */
function sorted(stars: OctreeLeafStar[]): OctreeLeafStar[] {
  return [...stars].sort((a, b) => a.mortonIndex - b.mortonIndex);
}

/**
 * A dense-core + sparse-satellite fixture built through the REAL octree +
 * encode/decode path. It is chosen because its node table interleaves a leaf
 * and an aggregate NON-monotonically by firstRecord:
 *
 *   node (level 0, morton 0)  dense leaf     firstRecord 0,  recordCount 65
 *   node (level 1, morton 0)  aggregate      firstRecord 69, recordCount 1
 *   node (level 1, morton 1)  fat leaf       firstRecord 65, recordCount 4
 *   node (level 2, morton 0)  root aggregate firstRecord 70, recordCount 1
 *
 * (nodes are ordered by (level, morton), so the aggregate's firstRecord 69
 * sits BEFORE the fat leaf's 65 in array order). A binary search over the whole
 * node table on firstRecord therefore mis-resolves; only a search over the leaf
 * subsequence [0, 65] is correct — which is exactly what this test pins.
 */
async function densePlusSparseCatalog() {
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
  const octree = buildStarOctree(sorted([...dense, ...sparse]), GRID);
  // Round-trip through the on-disk format so the resolver reads exactly the
  // bytes the runtime would load.
  return decodeStarCatalog(await encodeStarCatalog(octree));
}

describe('resolveStarRecord', () => {
  it('round-trips a packed leaf star position within quantisation', async () => {
    const cat = await densePlusSparseCatalog();
    expect(cat.starCount).toBe(STAR_LEAF_CAPACITY + 5); // 69 real-star records

    // ── A star in the DENSE level-0 leaf: exact reconstruction ──────────────
    // recordIndex 3 = the 4th dense star (s=3), stored in cell 0 (grid origin)
    // with the integer offset [3, 1, 2] — no folding, so the position is exact.
    const dense = resolveStarRecord(cat, 3)!;
    expect(dense).not.toBeNull();
    expect(dense.positionMpc[0]).toBeCloseTo((3 / 1024) * PC_TO_MPC, 18);
    expect(dense.positionMpc[1]).toBeCloseTo((1 / 1024) * PC_TO_MPC, 18);
    expect(dense.positionMpc[2]).toBeCloseTo((2 / 1024) * PC_TO_MPC, 18);
    // absMag 5.0 → LUT index floor((5-(-6))/0.19)=57 → centre -6 + 57.5·0.19.
    expect(dense.absMag).toBeCloseTo(-6.0 + 57.5 * 0.19, 10); // 4.925
    // bpRp 0.3 → index floor((0.3+0.6)/(5/64))=11 → centre -0.6 + 11.5·(5/64).
    expect(dense.bpRp).toBeCloseTo(-0.6 + 11.5 * (5 / 64), 10); // 0.2984375

    // ── A star in the FAT leaf (level 1): correct leaf found past the ─────────
    // ── interleaved aggregate, reconstructed at the coarser box scale ────────
    // recordIndex 65 = the first fat-leaf record = cell-8 star A. The stored
    // offset is folded (halved) into the level-1 box, so the position matches
    // the pre-merge world within one fat-leaf offset unit (× slack).
    const fat = resolveStarRecord(cat, STAR_LEAF_CAPACITY + 1)!;
    expect(fat).not.toBeNull();
    // Pre-merge world (pc): cell 8 = grid (2,0,0), offset [100,200,300]/1024.
    const wantPc = [2 + 100 / 1024, 0 + 200 / 1024, 0 + 300 / 1024];
    const boxCells = 2; // fat leaf sits at level 1
    const tolMpc = (boxCells / 1024) * 2 * GRID.cellEdgePc * PC_TO_MPC;
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(fat.positionMpc[axis]! - wantPc[axis]! * PC_TO_MPC)).toBeLessThanOrEqual(
        tolMpc,
      );
    }
    // Photometry is level-independent (folding only touches the offset): absMag
    // 4.0 → index 52; bpRp 0.5 → index 14. Exact dequantised bin centres.
    expect(fat.absMag).toBeCloseTo(-6.0 + 52.5 * 0.19, 10); // 3.975
    expect(fat.bpRp).toBeCloseTo(-0.6 + 14.5 * (5 / 64), 10); // 0.5328125
  });

  it('returns null for an out-of-range record index', async () => {
    const cat = await densePlusSparseCatalog();
    // starCount marks the end of the real-star region; the aggregate records
    // beyond it are never pick targets.
    expect(resolveStarRecord(cat, cat.starCount)).toBeNull();
    expect(resolveStarRecord(cat, 10_000)).toBeNull();
  });
});
