/**
 * A survey star must hold still on screen while the camera moves AU-close to it.
 * Its camera-relative position is a near-cancellation of parsec-sized terms, so
 * a careless f32 order snaps it in steps of a sizeable fraction of an AU, which
 * is the stair-stepping seen up close before the sphere takes over. The real
 * Gaia grid cell is ~23 pc; levels 0 and 5 cover a dim and a bright star.
 */
import { describe, expect, it } from 'vitest';

import type { Octree } from '../../../../src/@types/octree/Octree';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { StarColumns } from '../../../../src/layers/starCatalog/survey/@types/StarColumns';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import {
  CUT_UNIFORM_BYTES,
  FLOATS_PER_VIEW,
  writeOctreeCutUniforms,
} from '../../../../src/services/gpu/octree/octreeCutLayout';
import { referenceStarRecordRelCam } from '../../../helpers/starCatalog/referenceStarRecordRelCam';
import type { ReferenceStarRecord } from '../../../helpers/starCatalog/@types/ReferenceStarRecord';

const CELL_EDGE_PC = 23;
const ORIGIN_PC: Vec3 = [-11776.5, -11776.25, -11776.125];
const OCTREE = {
  family: 'star',
  grid: { bits: 10, cellEdge: CELL_EDGE_PC, origin: ORIGIN_PC },
  nodes: { count: 1 },
  chunkNodeCap: 0,
} as unknown as Octree<StarColumns>;
const CUT = {
  refineThreshold: 0.05,
  fadeStep: 0.1,
  drawBudget: 100,
  worldSpread: 1,
  leafMarginRad: 0.001,
  opacity: 1,
  planes: new Float32Array(FLOATS_PER_VIEW),
};

/** The record's true heliocentric position, in f64 Mpc. */
function truthMpc(record: ReferenceStarRecord): Vec3 {
  const edgeCells = 2 ** record.level;
  return [0, 1, 2].map(
    (a) =>
      (ORIGIN_PC[a]! + (record.cell[a]! + (record.offset[a]! / 65536) * edgeCells) * CELL_EDGE_PC) *
      SCALE_UNITS.PC_TO_MPC,
  ) as unknown as Vec3;
}

/**
 * Worst error of the reconstruction against f64 truth, as a fraction of the
 * star's distance (≈ the angular error in rad), over a camera that slides 1 AU
 * sideways at about `distanceAu` from the star.
 */
function worstRelativeError(record: ReferenceStarRecord, distanceAu: number): number {
  const star = truthMpc(record);
  const au = SCALE_UNITS.AU_TO_MPC;
  const buf = new ArrayBuffer(CUT_UNIFORM_BYTES);
  let worst = 0;
  for (let k = 0; k <= 100; k++) {
    const cam: Vec3 = [star[0] + distanceAu * au, star[1] + k * 0.01 * au, star[2] + 0.3 * au];
    writeOctreeCutUniforms(buf, OCTREE, { slots: 0 }, cam, CUT);
    const got = referenceStarRecordRelCam(buf, record);
    const want = [star[0] - cam[0], star[1] - cam[1], star[2] - cam[2]];
    const err = Math.hypot(got[0] - want[0]!, got[1] - want[1]!, got[2] - want[2]!);
    worst = Math.max(worst, err / Math.hypot(...want));
  }
  return worst;
}

// 1e-5 rad is 0.01 px at the app's 60° fov on a 1080 px canvas (~935 px/rad).
const MAX_ERROR_RAD = 1e-5;

describe('survey star position near the camera (vertex.wesl reconstruction)', () => {
  it('holds a level-0 star still to a hundredth of a pixel from 2 AU', () => {
    const record = { cell: [612, 487, 530], level: 0, offset: [40000, 12345, 51234] } as const;
    expect(worstRelativeError(record, 2)).toBeLessThan(MAX_ERROR_RAD);
  });

  it('holds a level-5 star (a bright one, stratified high) still from 2 AU', () => {
    const record = { cell: [608, 480, 512], level: 5, offset: [40000, 12345, 51234] } as const;
    expect(worstRelativeError(record, 2)).toBeLessThan(MAX_ERROR_RAD);
  });

  it('places a star from 1 Mpc away, past where the integer sum must not overflow', () => {
    const record = { cell: [608, 480, 512], level: 5, offset: [40000, 12345, 51234] } as const;
    expect(worstRelativeError(record, 1 / SCALE_UNITS.AU_TO_MPC)).toBeLessThan(MAX_ERROR_RAD);
  });
});
