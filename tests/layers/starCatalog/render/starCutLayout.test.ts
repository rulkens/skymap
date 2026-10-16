import { describe, it, expect } from 'vitest';

import {
  CAM_CELL_INT_INDEX,
  CAM_FRAC_FLOAT_INDEX,
  CHUNK_NODE_CAP_U32_INDEX,
  INDEX_NODES_U32_INDEX,
  NODE_COUNT_U32_INDEX,
  NODE_GRID_WORD,
  VIEW_COUNT_U32_INDEX,
  CUT_NODE_WORDS,
  CUT_MAX_VIEWS,
  CUT_UNIFORM_BYTES,
  FLOATS_PER_VIEW,
  chunkRootRefineDeltas,
  packStarChunkNodes,
  packStarCutNodes,
  writeStarCutUniforms,
} from '../../../../src/layers/starCatalog/render/starCutLayout';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { starOctreeFromSkst } from '../../../../src/utils/star/starOctreeFromSkst';
import { NO_CHUNK_REF } from '../../../../src/data/octree/octreeFormat';
import type { StarChunk } from '../../../../src/@types/data/starCatalog/StarChunk';

// Two level-0 leaves under one level-1 aggregate root. Morton puts x on the
// lowest bit: leaves 8 and 9 sit at x cells 2 and 3, their parent (morton 1,
// level 1) at x = 1 coarse cell = leaf cell 2.
const CATALOG = starOctreeFromSkst({
  starCount: 5,
  nodeCount: 3,
  mortonBitsPerAxis: 9,
  cellEdgePc: 10,
  gridOrigin: [0, 0, 0],
  nodes: [
    { mortonIndex: 8, level: 0, childMask: 0, firstRecord: 0, recordCount: 2 },
    { mortonIndex: 9, level: 0, childMask: 0, firstRecord: 2, recordCount: 3 },
    { mortonIndex: 1, level: 1, childMask: 0b11, firstRecord: 5, recordCount: 1 },
  ],
  records: new Uint8Array(6 * 6),
});

describe('packStarCutNodes', () => {
  const words = packStarCutNodes(CATALOG, 0);
  const at = (node: number) => words.subarray(node * CUT_NODE_WORDS, (node + 1) * CUT_NODE_WORDS);

  it('packs grid in LEAF cells, so a level-1 node is scaled by 2', () => {
    expect(at(0)[NODE_GRID_WORD]).toBe(2);
    expect(at(1)[NODE_GRID_WORD]).toBe(3);
    expect(at(2)[NODE_GRID_WORD]).toBe(2);
  });
});

describe('writeStarCutUniforms', () => {
  const cut = {
    refineThreshold: 0.05,
    fadeStep: 0.1,
    drawBudget: 100,
    worldSpread: 1,
    leafMarginRad: 0.001,
    opacity: 1,
    planes: new Float32Array(FLOATS_PER_VIEW),
  };
  const camAtPc = (pc: number) => [pc * SCALE_UNITS.PC_TO_MPC, 0, 0] as const;

  it('splits the camera into a whole cell and a [0,1) fraction, below zero too', () => {
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    writeStarCutUniforms(buf, CATALOG, { slots: 0 }, camAtPc(-25), cut); // -2.5 cells
    expect(new Int32Array(buf)[CAM_CELL_INT_INDEX]).toBe(-3);
    expect(new Float32Array(buf)[CAM_FRAC_FLOAT_INDEX]).toBeCloseTo(0.5, 6);

    writeStarCutUniforms(buf, CATALOG, { slots: 0 }, camAtPc(37), cut); // 3.7 cells
    expect(new Int32Array(buf)[CAM_CELL_INT_INDEX]).toBe(3);
    expect(new Float32Array(buf)[CAM_FRAC_FLOAT_INDEX]).toBeCloseTo(0.7, 6);
  });

  it('writes 0 views when more than CUT_MAX_VIEWS are asked for', () => {
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    const planes = new Float32Array((CUT_MAX_VIEWS + 1) * FLOATS_PER_VIEW);
    writeStarCutUniforms(buf, CATALOG, { slots: 0 }, camAtPc(0), {
      ...cut,
      planes,
    });
    expect(new Uint32Array(buf)[VIEW_COUNT_U32_INDEX]).toBe(0);
  });

  it('counts the pool rows and names the index and slot row stride', () => {
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    const octree = { ...CATALOG, chunkNodeCap: 7 };
    writeStarCutUniforms(buf, octree, { slots: 2 }, camAtPc(0), cut);
    const u32 = new Uint32Array(buf);
    expect(u32[NODE_COUNT_U32_INDEX]).toBe(3 + 2 * 7);
    expect(u32[INDEX_NODES_U32_INDEX]).toBe(3);
    expect(u32[CHUNK_NODE_CAP_U32_INDEX]).toBe(7);
  });
});

describe('packStarChunkNodes', () => {
  it("top rows name the root's index row, inner rows a pool-absolute parent, every firstRecord carries the record base", () => {
    // Root at level 2. Rows: two L0 children of the L1 row at Morton 0, then the
    // two L1 top rows. Records in row order, own then blob: 3, 2, 1 + blob, 4.
    const chunk: StarChunk = {
      ref: {
        id: 0,
        recordBase: 0,
        level: 2,
        morton: 0,
        roots: [0],
        hash: '',
        bytes: 0,
        nodes: 4,
        records: 7,
      },
      parent: null,
      nodes: {
        count: 4,
        morton: Uint32Array.of(0, 1, 0, 1),
        level: Uint8Array.of(0, 0, 1, 1),
        childMask: Uint8Array.of(0, 0, 0b11, 0),
        firstRecord: Uint32Array.of(0, 3, 5, 7),
        ownCount: Uint32Array.of(3, 2, 1, 4),
        blobCount: Uint32Array.of(0, 0, 5, 0),
        chunkRef: new Uint32Array(4).fill(NO_CHUNK_REF),
      },
      records: {
        count: 11,
        offset: new Uint16Array(33),
        absMag: new Float32Array(11),
        colourIndex: new Float32Array(11),
      },
      chunks: [],
    };
    const root = { level: 2, morton: 0, rootRow: 7 };
    const words = packStarChunkNodes(chunk, [root], { nodeBase: 40, recordBase: 1000 }, 6, 0);
    // Words: grid, firstRecord, bits (level | blob 16 | resident 32 | own << 8), blobCount,
    // parent, refineDelta.
    expect([...words]).toEqual([
      ...[0, 1000, 32 | (3 << 8), 0, 42, 0],
      ...[1, 1003, 32 | (2 << 8), 0, 42, 0],
      ...[0, 1005, 1 | 16 | 32 | (1 << 8), 5, 7, 3 + 2 - 1],
      ...[2, 1007, 1 | 32 | (4 << 8), 0, 7, 0],
      ...new Array(2 * CUT_NODE_WORDS).fill(0),
    ]);
    expect(chunkRootRefineDeltas(chunk, [root], 0)).toEqual([1 + 1 + 4 - 1]);
  });
});
