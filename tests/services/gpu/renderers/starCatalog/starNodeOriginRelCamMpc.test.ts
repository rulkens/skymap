import { describe, it, expect } from 'vitest';
import { starNodeOriginRelCamMpc } from '../../../../../src/services/gpu/renderers/starCatalog/starNodeOriginRelCamMpc';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { StarCatalog } from '../../../../../src/@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../../../../src/@types/data/starCatalog/StarCatalogNode';

const PC_TO_MPC = SCALE_UNITS.PC_TO_MPC; // 1e-6

// A catalog carrying only the geometry this seam reads: a 78 pc leaf grid whose
// corner sits [1000, 2000, 3000] pc from the Sun.
function catalogFixture(): StarCatalog {
  return {
    starCount: 0,
    nodeCount: 0,
    mortonBitsPerAxis: 10,
    cellEdgePc: 78,
    gridOrigin: [1000, 2000, 3000],
    nodes: [],
    records: new Uint8Array(0),
  };
}

function node(mortonIndex: number, level: number): StarCatalogNode {
  return { mortonIndex, level, childMask: 0, firstRecord: 0, recordCount: 0 };
}

// mortonIndex 53 decodes to grid cell [1, 2, 3]:
//   x=1 (bit0) → code bit 0  = 1
//   y=2 (bit1) → code bit 4  = 16
//   z=3 (bits0,1) → code bits 2,5 = 4 + 32
//   1 + 16 + 4 + 32 = 53
const MORTON_1_2_3 = 53;

describe('starNodeOriginRelCamMpc', () => {
  it('computes a leaf origin relative to the camera', () => {
    // Leaf (level 0, 2^0 = 1 cell).
    //   nodeOriginPc = [1000 + 1·78, 2000 + 2·78, 3000 + 3·78]
    //                = [1078, 2156, 3234] pc
    //   nodeOriginMpc = [1.078e-3, 2.156e-3, 3.234e-3] Mpc
    // Camera one leaf-worth closer on each axis, in Mpc:
    const camPosMpc: Vec3 = [1.0e-3, 2.0e-3, 3.0e-3];
    //   originRelCamMpc = [0.078e-3, 0.156e-3, 0.234e-3]
    //                   = [7.8e-5, 1.56e-4, 2.34e-4] Mpc
    //   cellScaleMpc = 78 · 1 · 1e-6 = 7.8e-5 Mpc
    const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(
      catalogFixture(),
      node(MORTON_1_2_3, 0),
      camPosMpc,
    );

    expect(originRelCamMpc[0]).toBeCloseTo(7.8e-5, 12);
    expect(originRelCamMpc[1]).toBeCloseTo(1.56e-4, 12);
    expect(originRelCamMpc[2]).toBeCloseTo(2.34e-4, 12);
    expect(cellScaleMpc).toBeCloseTo(7.8e-5, 12);
  });

  it('scales an aggregate box by 2^level', () => {
    // Aggregate at level 2 → box spans 2^2 = 4 leaf cells per axis.
    //   boxEdgePc = 78 · 4 = 312 pc
    //   boxOriginPc = [1000 + 1·312, 2000 + 2·312, 3000 + 3·312]
    //               = [1312, 2624, 3936] pc
    //   boxOriginMpc = [1.312e-3, 2.624e-3, 3.936e-3] Mpc
    const camPosMpc: Vec3 = [1.0e-3, 2.0e-3, 3.0e-3];
    //   originRelCamMpc = [0.312e-3, 0.624e-3, 0.936e-3]
    //                   = [3.12e-4, 6.24e-4, 9.36e-4] Mpc
    //   cellScaleMpc = 78 · 4 · 1e-6 = 3.12e-4 Mpc (4× the leaf's 7.8e-5)
    const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(
      catalogFixture(),
      node(MORTON_1_2_3, 2),
      camPosMpc,
    );

    expect(originRelCamMpc[0]).toBeCloseTo(3.12e-4, 12);
    expect(originRelCamMpc[1]).toBeCloseTo(6.24e-4, 12);
    expect(originRelCamMpc[2]).toBeCloseTo(9.36e-4, 12);
    expect(cellScaleMpc).toBeCloseTo(3.12e-4, 12);
    // 4× the leaf's cell scale, by construction.
    expect(cellScaleMpc).toBeCloseTo(4 * 7.8e-5, 12);
  });

  it('is finite for a coincident (zero-distance) node', () => {
    // Sun-exclusion robustness (Decision 3): a node whose world origin equals
    // the camera must yield exactly the zero vector and a finite scale — there
    // is no division in the seam, so nothing to divide by zero.
    //   node 53, level 0 → nodeOriginPc = [1078, 2156, 3234] pc
    // Place the camera exactly there, computed the same way the seam does so
    // the f64 subtraction cancels bit-for-bit:
    const camPosMpc: Vec3 = [1078 * PC_TO_MPC, 2156 * PC_TO_MPC, 3234 * PC_TO_MPC];

    const { originRelCamMpc, cellScaleMpc } = starNodeOriginRelCamMpc(
      catalogFixture(),
      node(MORTON_1_2_3, 0),
      camPosMpc,
    );

    expect(originRelCamMpc).toEqual([0, 0, 0]);
    expect(Number.isFinite(cellScaleMpc)).toBe(true);
    expect(cellScaleMpc).toBeCloseTo(7.8e-5, 12);
  });
});
