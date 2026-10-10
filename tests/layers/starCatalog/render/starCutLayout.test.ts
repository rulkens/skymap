import { describe, it, expect } from 'vitest';

import {
  CAM_CELL_INT_INDEX,
  CAM_FRAC_FLOAT_INDEX,
  NODE_GRID_WORD,
  VIEW_COUNT_U32_INDEX,
  CUT_NODE_WORDS,
  CUT_MAX_VIEWS,
  CUT_UNIFORM_BYTES,
  FLOATS_PER_VIEW,
  packStarCutNodes,
  writeStarCutUniforms,
} from '../../../../src/layers/starCatalog/render/starCutLayout';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { StarCatalog } from '../../../../src/@types/data/starCatalog/StarCatalog';

// Two level-0 leaves under one level-1 aggregate root. Morton puts x on the
// lowest bit: leaves 8 and 9 sit at x cells 2 and 3, their parent (morton 1,
// level 1) at x = 1 coarse cell = leaf cell 2.
const CATALOG: StarCatalog = {
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
};

describe('packStarCutNodes', () => {
  const words = packStarCutNodes(CATALOG);
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
    budgetTypical: 100,
    worldSpread: 1,
    leafMarginRad: 0.001,
    opacity: 1,
    planes: new Float32Array(FLOATS_PER_VIEW),
  };
  const camAtPc = (pc: number) => [pc * SCALE_UNITS.PC_TO_MPC, 0, 0] as const;

  it('splits the camera into a whole cell and a [0,1) fraction, below zero too', () => {
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    writeStarCutUniforms(buf, CATALOG, camAtPc(-25), cut); // -2.5 cells
    expect(new Int32Array(buf)[CAM_CELL_INT_INDEX]).toBe(-3);
    expect(new Float32Array(buf)[CAM_FRAC_FLOAT_INDEX]).toBeCloseTo(0.5, 6);

    writeStarCutUniforms(buf, CATALOG, camAtPc(37), cut); // 3.7 cells
    expect(new Int32Array(buf)[CAM_CELL_INT_INDEX]).toBe(3);
    expect(new Float32Array(buf)[CAM_FRAC_FLOAT_INDEX]).toBeCloseTo(0.7, 6);
  });

  it('writes 0 views when more than CUT_MAX_VIEWS are asked for', () => {
    const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
    const planes = new Float32Array((CUT_MAX_VIEWS + 1) * FLOATS_PER_VIEW);
    writeStarCutUniforms(buf, CATALOG, camAtPc(0), {
      ...cut,
      planes,
    });
    expect(new Uint32Array(buf)[VIEW_COUNT_U32_INDEX]).toBe(0);
  });
});
