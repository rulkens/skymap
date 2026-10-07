/**
 * `referenceStarCut` is the executable reference for `cut.wesl`; these pin the
 * cut's behaviour on a hand-built octree (leaf cells, edge 1 pc):
 *
 *   6 root (L2, x 0..4)
 *   ├─ 4 aggregate (L1, x 0..2) ── 0 leaf (8 records, x 0..1), 1 leaf (9 records, x 1..2)
 *   └─ 5 aggregate (L1, x 2..4) ── 2 leaf (3 records, x 2..3), 3 leaf (1 record, x 3..4)
 *
 * `refineThreshold` is the edge/distance ratio at which a box refines.
 */
import { describe, it, expect } from 'vitest';

import { referenceStarCut } from '../../../../helpers/starCatalog/referenceStarCut';
import {
  CUT_UNIFORM_BYTES,
  CUT_NODE_WORDS,
  NODE_PARENT_WORD,
  FLOATS_PER_VIEW,
  packStarCutNodes,
  writeStarCutUniforms,
} from '../../../../../src/layers/starCatalog/render/starCutLayout';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const ROOT = 6;
const NODE_MASK = 0x3fffff;
const CATALOG: StarCatalog = {
  starCount: 21,
  nodeCount: 7,
  mortonBitsPerAxis: 9,
  cellEdgePc: 1,
  gridOrigin: [0, 0, 0],
  nodes: [
    { mortonIndex: 0, level: 0, childMask: 0, firstRecord: 0, recordCount: 8 },
    { mortonIndex: 1, level: 0, childMask: 0, firstRecord: 8, recordCount: 9 },
    { mortonIndex: 8, level: 0, childMask: 0, firstRecord: 17, recordCount: 3 },
    { mortonIndex: 9, level: 0, childMask: 0, firstRecord: 20, recordCount: 1 },
    { mortonIndex: 0, level: 1, childMask: 0b11, firstRecord: 21, recordCount: 1 },
    { mortonIndex: 1, level: 1, childMask: 0b11, firstRecord: 22, recordCount: 1 },
    { mortonIndex: 0, level: 2, childMask: 0b11, firstRecord: 23, recordCount: 1 },
  ],
  records: new Uint8Array(24 * 6),
};
const NODES = packStarCutNodes(CATALOG);
const LEAVES = [0, 1, 2, 3];

type Over = {
  budget?: number;
  threshold?: number;
  fadeStep?: number;
  planes?: Float32Array;
  worldSpread?: number;
  opacity?: number[];
};

/** Camera in leaf cells (never an exact integer: the cell split is an f64 floor). */
function run(camCells: Vec3, over: Over = {}) {
  const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
  const camMpc = camCells.map((c) => c * SCALE_UNITS.PC_TO_MPC) as unknown as Vec3;
  writeStarCutUniforms(buf, CATALOG, camMpc, {
    refineThreshold: over.threshold ?? 2,
    fadeStep: over.fadeStep ?? 1,
    budgetTypical: over.budget ?? 1_000_000,
    worldSpread: over.worldSpread ?? 1,
    leafMarginRad: 0,
    opacity: 1,
    planes: over.planes ?? new Float32Array(0),
  });
  const opacity = Float32Array.from(over.opacity ?? new Array(CATALOG.nodes.length).fill(0));
  return referenceStarCut(NODES, buf, opacity);
}

type Cut = ReturnType<typeof run>;
const members = (r: Cut) => [...r.opacity].flatMap((o, i) => (o === 1 ? [i] : []));
const leafNodes = (r: Cut) => r.leafEntries.map((e) => e & NODE_MASK);
const parentOf = (i: number) => NODES[i * CUT_NODE_WORDS + NODE_PARENT_WORD]!;

/** One view whose first plane keeps `nx * x + offsetCells >= 0` (camera-relative); the rest never cut. */
function onePlaneView(nx: number, offsetCells: number): Float32Array {
  const planes = new Float32Array(FLOATS_PER_VIEW);
  planes.set([nx, 0, 0, offsetCells * SCALE_UNITS.PC_TO_MPC]);
  for (let p = 1; p < 6; p++) planes.set([0, 0, 0, 1], p * 4);
  return planes;
}

describe('referenceStarCut membership', () => {
  it('a far camera keeps only the root aggregate', () => {
    const r = run([500.5, 0.5, 0.5]);
    expect(members(r)).toEqual([ROOT]);
    expect(r.aggregates).toEqual([ROOT]);
    expect(r.leafEntries).toEqual([]);
  });

  it('a near camera splits the box it is in into leaves; the far sibling stays an aggregate', () => {
    const r = run([0.5, 0.5, 0.5]);
    expect(members(r)).toEqual([0, 1, 5]);
    expect(r.aggregates).toEqual([5]);
    expect(leafNodes(r)).toEqual([0, 1, 1]);
  });

  it('is a partition: every leaf is covered exactly once, whatever the camera or budget', () => {
    const cams: Vec3[] = [
      [500.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [2.5, 0.5, 0.5],
      [3.5, 3.5, 3.5],
      [-1.5, 0.5, 0.5],
      [1.99, 0.5, 0.5],
    ];
    for (const cam of cams) {
      for (const budget of [0, 2, 6, 1_000_000]) {
        const inCut = new Set(members(run(cam, { budget, threshold: 0.5 })));
        for (const leaf of LEAVES) {
          const chain = [leaf];
          while (parentOf(chain.at(-1)!) !== chain.at(-1)) chain.push(parentOf(chain.at(-1)!));
          expect(
            chain.filter((n) => inCut.has(n)),
            `leaf ${leaf}, cam ${cam}, budget ${budget}`,
          ).toHaveLength(1);
        }
      }
    }
  });
});

describe('referenceStarCut budget', () => {
  // Camera inside node 5's box: root and 5 sit at distance 0 (bin 1023, deltas 1 + 3);
  // node 4 is 0.5 cells away (proxy 16, two octaves over threshold 2, bin 128, delta 16).
  const sweep = (budget: number) => run([2.5, 0.5, 0.5], { budget });

  it('a larger budget lowers the threshold bin, step by step', () => {
    expect(sweep(0).cutBin).toBe(1024);
    expect(sweep(1).cutBin).toBe(1024);
    expect(sweep(2).cutBin).toBe(1023);
    expect(sweep(5).cutBin).toBe(1023);
    expect(sweep(6).cutBin).toBe(128);
    expect(sweep(100).cutBin).toBe(0);
  });

  it('budget 0 draws the root only', () => {
    expect(members(sweep(0))).toEqual([ROOT]);
  });

  it('emitted records overshoot the budget by at most one bin', () => {
    const records = (r: Cut) =>
      members(r).reduce((sum, i) => sum + CATALOG.nodes[i]!.recordCount, 0);
    expect(records(sweep(2))).toBe(1 + 3 + 1); // aggregate 4, leaves 2 and 3
    expect(records(sweep(6))).toBe(21);
  });
});

describe('referenceStarCut frustum prune', () => {
  it('does not list a node outside the frustum but still advances its fade', () => {
    // Keeps x_rel <= 1 cell: aggregate 5 (x_rel 1.5..3.5) is out, leaves 0 and 1 are in.
    const r = run([0.5, 0.5, 0.5], { planes: onePlaneView(-1, 1), worldSpread: 0.01 });
    expect(r.aggregates).toEqual([]);
    expect(r.opacity[5]).toBe(1);
    expect(leafNodes(r)).toEqual([0, 1, 1]);
  });

  it('an unlisted refined parent still makes its children members', () => {
    // Camera at x = 4.5: the root and node 5 refine, node 4 does not. Keeps x_rel >= -1,
    // so the root and node 4 are outside; node 4 is a member all the same.
    const r = run([4.5, 0.5, 0.5], { planes: onePlaneView(1, 1), worldSpread: 0.01 });
    expect(members(r)).toEqual([2, 3, 4]);
    expect(r.aggregates).toEqual([]);
    expect(leafNodes(r)).toEqual([3]);
  });
});

describe('referenceStarCut leaf blocks', () => {
  it('claims ceil(records / 8) entries per leaf, with the block in the high bits', () => {
    // Leaf 0 has 8 records (one block), leaf 1 has 9 (two).
    expect(run([0.5, 0.5, 0.5]).leafEntries).toEqual([0, 1, 1 + 2 ** 22]);
  });
});

describe('referenceStarCut fades', () => {
  it('steps toward 1 for members and 0 for non-members, never past either', () => {
    // Members 0, 1, 5; non-members 2, 3, 4, 6.
    const r = run([0.5, 0.5, 0.5], { fadeStep: 0.25, opacity: [0.5, 0.9, 0, 0.5, 0.1, 0.5, 1] });
    expect([...r.opacity]).toEqual([0.75, 1, 0, 0.25, 0, 0.75, 0.75]);
  });
});
