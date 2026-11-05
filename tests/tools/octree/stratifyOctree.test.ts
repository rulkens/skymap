import { describe, expect, it } from 'vitest';

import { mortonEncode3 } from '../../../src/utils/math/mortonEncode3';
import { stratifyOctree } from '../../../tools/octree/stratifyOctree';
import { fluxFromAbsMag } from '../../../tools/stars/mergeFluxAggregate';
import { makeOctreeBuildInput, randomOctreeRecords } from '../../fixtures/makeOctreeBuildInput';

const GAIA_LIKE_GRID = { bits: 10, origin: [0, 0, 0] as [number, number, number], cellEdge: 23.4 };
const SMALL_GRID = { bits: 6, origin: [0, 0, 0] as [number, number, number], cellEdge: 10 };

describe('stratifyOctree', () => {
  it('a record lives at the level its magnitude earns', () => {
    // Levels at thr 0.16, mLim 10, refUnit 10, cellEdge 23.4: M 10 → 0, M 12 → 0, M 1 → 2, M −3 → 5.
    // Cells (pc / 23.4, floored): (100, 200, 300) → (4, 8, 12); (50, 60, 70) → (2, 2, 2);
    // (1000, 2000, 3000) → (42, 85, 128), which is (1, 2, 4) at level 5.
    const cases = [
      { pos: [100, 200, 300], absMag: 10, level: 0, cell: [4, 8, 12] },
      { pos: [50, 60, 70], absMag: 12, level: 0, cell: [2, 2, 2] },
      { pos: [100, 200, 300], absMag: 1, level: 2, cell: [1, 2, 3] },
      { pos: [1000, 2000, 3000], absMag: -3, level: 5, cell: [1, 2, 4] },
    ] as const;
    const tree = stratifyOctree(
      makeOctreeBuildInput(
        cases.map((c) => ({ pos: [...c.pos], absMag: c.absMag })),
        GAIA_LIKE_GRID,
      ),
    );
    const mags = tree.columns.get('absMag')!;
    const { nodes } = tree;
    for (const c of cases) {
      const record = mags.indexOf(Math.fround(c.absMag));
      let row = -1;
      for (let i = 0; i < nodes.count; i++) {
        const first = nodes.firstRecord[i]!;
        if (record >= first && record < first + nodes.ownCount[i]!) row = i;
      }
      expect(row).toBeGreaterThanOrEqual(0);
      expect(nodes.level[row]).toBe(c.level);
      expect(nodes.morton[row]).toBe(mortonEncode3(c.cell[0], c.cell[1], c.cell[2]));
    }
  });

  it('own + blob flux equals subtree flux at every node', () => {
    const tree = stratifyOctree(
      makeOctreeBuildInput(randomOctreeRecords(200, 7, 640, [-6, 14]), SMALL_GRID),
    );
    const { nodes, childIndex } = tree;
    const mags = tree.columns.get('absMag')!;
    let blobsChecked = 0;
    for (let i = 0; i < nodes.count; i++) {
      if (nodes.childMask[i] === 0) continue;
      // Brute force: every strict descendant's own records, never row i's own.
      let flux = 0;
      let count = 0;
      const stack = [i];
      while (stack.length > 0) {
        const row = stack.pop()!;
        for (let o = 0; o < 8; o++) {
          const c = childIndex[row * 8 + o]!;
          if (c < 0) continue;
          stack.push(c);
          for (let k = 0; k < nodes.ownCount[c]!; k++) {
            flux += fluxFromAbsMag(mags[nodes.firstRecord[c]! + k]!);
            count++;
          }
        }
      }
      const blobMag = mags[nodes.firstRecord[i]! + nodes.ownCount[i]!]!;
      expect(nodes.blobCount[i]).toBe(count);
      expect(Math.abs(fluxFromAbsMag(blobMag) * count - flux) / flux).toBeLessThan(1e-6);
      blobsChecked++;
    }
    expect(blobsChecked).toBeGreaterThan(20);
  });

  it('rows sort by (level, morton) and the root is last; records lie own-then-blob per row', () => {
    const n = 200;
    const tree = stratifyOctree(
      makeOctreeBuildInput(randomOctreeRecords(n, 11, 640, [-6, 14]), SMALL_GRID),
    );
    const { nodes } = tree;
    const last = nodes.count - 1;
    expect(nodes.level[last]).toBe(SMALL_GRID.bits);
    expect(nodes.morton[last]).toBe(0);
    let blobs = 0;
    for (let i = 0; i < nodes.count; i++) {
      const hasBlob = nodes.childMask[i] !== 0 ? 1 : 0;
      blobs += hasBlob;
      if (i === last) break;
      const order =
        nodes.level[i]! - nodes.level[i + 1]! || nodes.morton[i]! - nodes.morton[i + 1]!;
      expect(order).toBeLessThan(0);
      expect(nodes.firstRecord[i]! + nodes.ownCount[i]! + hasBlob).toBe(nodes.firstRecord[i + 1]);
    }
    expect(nodes.firstRecord[0]).toBe(0);
    expect(tree.columns.get('absMag')!.length).toBe(n + blobs);
  });
});
