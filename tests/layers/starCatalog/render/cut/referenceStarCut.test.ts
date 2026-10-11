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
  OPACITY_CHANNELS,
  OWN_OPACITY,
  BLOB_OPACITY,
  NODE_BITS_WORD,
  NODE_REFINE_DELTA_WORD,
  NODE_RESIDENT_BIT,
  NODE_BLOB_COUNT_WORD,
  NODE_FOLDED_BIT,
  OWN_COUNT_SHIFT,
  chunkRootRefineDelta,
  packStarChunkNodes,
  packStarCutNodes,
  writeStarCutUniforms,
} from '../../../../../src/layers/starCatalog/render/starCutLayout';
import { NO_CHUNK_REF, STAR_COLUMN_SCHEMA } from '../../../../../src/data/octree/octreeFormat';
import { stratifyOctree } from '../../../../../tools/octree/stratifyOctree';
import {
  makeOctreeBuildInput,
  randomOctreeRecords,
} from '../../../../fixtures/makeOctreeBuildInput';
import type { StarOctree } from '../../../../../src/@types/data/starCatalog/StarOctree';
import type { StarChunk } from '../../../../../src/@types/data/starCatalog/StarChunk';
import type { OctreeGrid } from '../../../../../src/@types/octree/OctreeGrid';
import type { OctreeNodeTable } from '../../../../../src/@types/octree/OctreeNodeTable';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { SkstCatalog } from '../../../../../src/@types/data/starCatalog/SkstCatalog';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { starOctreeFromSkst } from '../../../../../src/utils/star/starOctreeFromSkst';

const ROOT = 6;
const NODE_MASK = 0x3fffff;
const CATALOG: SkstCatalog = {
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
const OCTREE = starOctreeFromSkst(CATALOG);
const NODES = packStarCutNodes(OCTREE, 0);
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
  writeStarCutUniforms(buf, OCTREE, { slots: 0 }, camMpc, {
    refineThreshold: over.threshold ?? 2,
    fadeStep: over.fadeStep ?? 1,
    drawBudget: over.budget ?? 1_000_000,
    worldSpread: over.worldSpread ?? 1,
    leafMarginRad: 0,
    opacity: 1,
    planes: over.planes ?? new Float32Array(0),
  });
  // A v1 leaf draws only its own records, a v1 aggregate only its blob: one channel each.
  const opacity = new Float32Array(CATALOG.nodes.length * OPACITY_CHANNELS);
  over.opacity?.forEach((o, i) => (opacity[channelOf(i)] = o));
  return referenceStarCut(NODES, buf, opacity);
}

function channelOf(i: number): number {
  return i * OPACITY_CHANNELS + (CATALOG.nodes[i]!.childMask === 0 ? OWN_OPACITY : BLOB_OPACITY);
}

type Cut = ReturnType<typeof run>;
const drawnOpacity = (r: Cut) => CATALOG.nodes.map((_, i) => r.opacity[channelOf(i)]!);
const members = (r: Cut) => drawnOpacity(r).flatMap((o, i) => (o === 1 ? [i] : []));
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
    expect(drawnOpacity(r)[5]).toBe(1);
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
    expect(drawnOpacity(r)).toEqual([0.75, 1, 0, 0.25, 0, 0.75, 0.75]);
  });
});

// ─── Own records + blob, over a pool ─────────────────────────────────────────

type Row = {
  level: number;
  morton: number;
  childMask: number;
  own: number;
  blob: number;
  chunkRef?: number;
};

/** A node table from rows in (level, morton) order; records follow row order, own then blob. */
function table(rows: readonly Row[]): OctreeNodeTable {
  const n = rows.length;
  const t = {
    count: n,
    morton: Uint32Array.from(rows, (r) => r.morton),
    level: Uint8Array.from(rows, (r) => r.level),
    childMask: Uint8Array.from(rows, (r) => r.childMask),
    firstRecord: new Uint32Array(n),
    ownCount: Uint32Array.from(rows, (r) => r.own),
    blobCount: Uint32Array.from(rows, (r) => r.blob),
    chunkRef: Uint32Array.from(rows, (r) => r.chunkRef ?? NO_CHUNK_REF),
  };
  let next = 0;
  rows.forEach((r, i) => {
    t.firstRecord[i] = next;
    next += r.own + (r.childMask !== 0 ? 1 : 0);
  });
  return t;
}

function octreeOf(nodes: OctreeNodeTable, grid: OctreeGrid, chunk?: StarChunk): StarOctree {
  const count = nodes.count === 0 ? 0 : nodes.firstRecord[nodes.count - 1]! + 8192;
  return {
    grid,
    starCount: 0,
    columns: STAR_COLUMN_SCHEMA,
    nodes,
    records: {
      count,
      offset: new Uint16Array(0),
      absMag: new Float32Array(0),
      colourIndex: new Float32Array(0),
    },
    chunks: chunk
      ? [{ level: 0, morton: 0, hash: '', bytes: 0, nodes: chunk.nodes.count, records: 0 }]
      : [],
    chunkCapacity: chunk ? 16 : 0,
    chunkNodeCap: chunk ? chunk.nodes.count : 0,
    recordOrdinalBase: Uint32Array.of(count),
  };
}

function cutOver(
  octree: StarOctree,
  slots: number,
  pool: Uint32Array,
  camCells: Vec3,
  over: { budget?: number; threshold?: number; fadeStep?: number; opacity?: Float32Array } = {},
) {
  const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
  const camMpc = camCells.map(
    (c) => c * octree.grid.cellEdge * SCALE_UNITS.PC_TO_MPC,
  ) as unknown as Vec3;
  writeStarCutUniforms(buf, octree, { slots }, camMpc, {
    refineThreshold: over.threshold ?? 2,
    fadeStep: over.fadeStep ?? 1,
    drawBudget: over.budget ?? 1_000_000,
    worldSpread: 1,
    leafMarginRad: 0,
    opacity: 1,
    planes: new Float32Array(0),
  });
  const rows = pool.length / CUT_NODE_WORDS;
  return referenceStarCut(pool, buf, over.opacity ?? new Float32Array(rows * OPACITY_CHANNELS));
}

const ownOf = (pool: Uint32Array, i: number) =>
  pool[i * CUT_NODE_WORDS + NODE_BITS_WORD]! >>> OWN_COUNT_SHIFT;
const instancesOf = (pool: Uint32Array, r: Cut) =>
  [...new Set(r.leafEntries.map((e) => e & NODE_MASK))].reduce(
    (sum, i) => sum + ownOf(pool, i),
    0,
  ) + r.aggregates.length;

describe('referenceStarCut over own records and blobs', () => {
  it('refineDelta equals the instance count a refine adds, against a brute-force cut', () => {
    const grid: OctreeGrid = { bits: 6, origin: [0, 0, 0], cellEdge: 10 };
    const tree = stratifyOctree(
      makeOctreeBuildInput(randomOctreeRecords(200, 7, 640, [-6, 14]), grid),
    );
    const octree = octreeOf(tree.nodes, grid);
    const pool = packStarCutNodes(octree, 0);
    const n = tree.nodes.count;
    const root = n - 1;
    const parent = (i: number) => pool[i * CUT_NODE_WORDS + NODE_PARENT_WORD]!;
    expect(ownOf(pool, root)).toBeGreaterThan(0);

    // Brute force: a row draws its own records when its parent refines, its blob
    // when it draws its own records and does not refine itself.
    const brute = (refined: ReadonlySet<number>) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const drawOwn = i === root || refined.has(parent(i));
        const drawBlob = drawOwn && !refined.has(i) && tree.nodes.childMask[i] !== 0;
        sum += (drawOwn ? tree.nodes.ownCount[i]! : 0) + (drawBlob ? 1 : 0);
      }
      return sum;
    };

    // 100 cells past the root's 64-cell box: the root's edge/distance is 0.64 and
    // no child's exceeds 0.32, so at threshold 0.5 exactly the root refines.
    const cam: Vec3 = [164.5, 32.5, 32.5];
    const none = cutOver(octree, 0, pool, cam, { threshold: 0.5, budget: 0 });
    const one = cutOver(octree, 0, pool, cam, { threshold: 0.5 });
    expect(one.aggregates).not.toContain(root);
    expect(instancesOf(pool, none)).toBe(brute(new Set()));
    expect(instancesOf(pool, one)).toBe(brute(new Set([root])));
    expect(instancesOf(pool, one) - instancesOf(pool, none)).toBe(
      pool[root * CUT_NODE_WORDS + NODE_REFINE_DELTA_WORD],
    );
  });

  it('a folded subtree draws as points with its anchor, conserving every record', () => {
    const grid: OctreeGrid = { bits: 6, origin: [0, 0, 0], cellEdge: 10 };
    const stars = 2000;
    const tree = stratifyOctree(
      makeOctreeBuildInput(randomOctreeRecords(stars, 11, 640, [-6, 14]), grid),
    );
    const octree = octreeOf(tree.nodes, grid);
    const pool = packStarCutNodes(octree);
    const word = (i: number, w: number) => pool[i * CUT_NODE_WORDS + w]!;
    const folded = (i: number) => (word(i, NODE_BITS_WORD) & NODE_FOLDED_BIT) !== 0;
    const rows = tree.nodes.count;
    const childful = [...Array(rows).keys()].filter((i) => tree.nodes.childMask[i] !== 0);
    expect(childful.some(folded)).toBe(true);
    expect(childful.every(folded)).toBe(false);

    const drawnRecords = (r: Cut) =>
      [...new Set(r.leafEntries.map((e) => e & NODE_MASK))].reduce(
        (sum, i) => sum + ownOf(pool, i),
        0,
      ) + r.aggregates.reduce((sum, i) => sum + word(i, NODE_BLOB_COUNT_WORD), 0);
    for (const cam of [
      [164.5, 32.5, 32.5],
      [70.5, 3.5, 60.5],
      [5.5, 5.5, 5.5],
      [32.5, 32.5, 32.5],
    ] as Vec3[]) {
      const r = cutOver(octree, 0, pool, cam, { threshold: 0.5 });
      expect(drawnRecords(r), `camera ${cam}`).toBe(stars);
      expect(r.aggregates.filter(folded), `camera ${cam}`).toEqual([]);
    }

    const root = rows - 1;
    const far: Vec3 = [164.5, 32.5, 32.5];
    const none = cutOver(octree, 0, pool, far, { threshold: 0.5, budget: 0 });
    const one = cutOver(octree, 0, pool, far, { threshold: 0.5 });
    expect(instancesOf(pool, one) - instancesOf(pool, none)).toBe(
      word(root, NODE_REFINE_DELTA_WORD),
    );
  });

  // Index: one chunk root (L1, x 0..2) holding 2 own records and a blob over 3 stars.
  // Its chunk: two L0 rows, 1 and 2 own records, in the pool's one slot (rows 1, 2).
  const grid: OctreeGrid = { bits: 1, origin: [0, 0, 0], cellEdge: 1 };
  const chunk: StarChunk = {
    ref: 0,
    nodes: table([
      { level: 0, morton: 0, childMask: 0, own: 1, blob: 0 },
      { level: 0, morton: 1, childMask: 0, own: 2, blob: 0 },
    ]),
    records: {
      count: 3,
      offset: new Uint16Array(9),
      absMag: new Float32Array(3),
      colourIndex: new Float32Array(3),
    },
  };
  const octree = octreeOf(
    table([{ level: 1, morton: 0, childMask: 0b11, own: 2, blob: 3, chunkRef: 0 }]),
    grid,
    chunk,
  );
  const root = { level: 1, morton: 0, rootRow: 0 };
  const chunkRows = packStarChunkNodes(chunk, root, { nodeBase: 1, recordBase: 3 }, 2, 0);
  const poolOf = (resident: boolean) => {
    const pool = new Uint32Array(3 * CUT_NODE_WORDS);
    pool.set(packStarCutNodes(octree, 0));
    pool.set(chunkRows, CUT_NODE_WORDS);
    if (resident) {
      pool[NODE_BITS_WORD] = pool[NODE_BITS_WORD]! | NODE_RESIDENT_BIT;
      pool[NODE_REFINE_DELTA_WORD] = chunkRootRefineDelta(chunk, root, 0);
    }
    return pool;
  };
  const inside: Vec3 = [0.5, 0.5, 0.5];

  it('a chunk root with an unresident chunk never refines, however near the camera', () => {
    const pool = poolOf(false);
    const r = cutOver(octree, 1, pool, inside);
    expect(r.aggregates).toEqual([0]);
    expect(r.leafEntries.map((e) => e & NODE_MASK)).toEqual([0]);

    // The same pool with the chunk resident refines the root into its chunk rows.
    const landed = cutOver(octree, 1, poolOf(true), inside);
    expect(landed.aggregates).toEqual([]);
    expect(landed.leafEntries.map((e) => e & NODE_MASK)).toEqual([0, 1, 2]);
  });

  it('a refining node keeps drawing its own records while its blob fades out', () => {
    const pool = poolOf(true);
    let opacity: Float32Array = new Float32Array(3 * OPACITY_CHANNELS);
    opacity[OWN_OPACITY] = 1;
    opacity[BLOB_OPACITY] = 1;
    const steps: number[][] = [];
    for (let k = 0; k < 4; k++) {
      opacity = cutOver(octree, 1, pool, inside, { fadeStep: 0.25, opacity }).opacity;
      steps.push([
        opacity[OWN_OPACITY]!,
        opacity[BLOB_OPACITY]!,
        opacity[2 + OWN_OPACITY]!,
        opacity[4 + OWN_OPACITY]!,
      ]);
    }
    expect(steps).toEqual([
      [1, 0.75, 0.25, 0.25],
      [1, 0.5, 0.5, 0.5],
      [1, 0.25, 0.75, 0.75],
      [1, 0, 1, 1],
    ]);
  });
});
