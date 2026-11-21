/**
 * referenceStarRecordRelCam: the executable reference for `vertex.wesl`'s world
 * reconstruction (`recordRelCamCells` in `cutIo.wesl`, times `cellEdgeMpc`),
 * every operation rounded to f32 as the GPU rounds it, so tests can pin the
 * precision of a star's camera-relative position. The two must change together,
 * operation for operation: the order of the f32 sums is the contract.
 */

import type { ReferenceStarRecord } from './@types/ReferenceStarRecord';
import {
  CAM_CELL_INT_INDEX,
  CAM_FRAC_FLOAT_INDEX,
  CAM_FRAC_LO_FLOAT_INDEX,
  CELL_EDGE_MPC_FLOAT_INDEX,
} from '../../../src/services/gpu/octree/octreeCutLayout';

/** `OFFSET_SCALE` in `vertex.wesl`: offset 0..65535 spans one box. */
const OFFSET_SCALE = 1 / 65536;

export function referenceStarRecordRelCam(
  uniforms: ArrayBuffer,
  record: ReferenceStarRecord,
): [number, number, number] {
  const i32 = new Int32Array(uniforms);
  const f32 = new Float32Array(uniforms);
  const f = Math.fround;
  const edgeCells = 2 ** record.level;
  const out: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const offsetFrac = f(record.offset[a]! * OFFSET_SCALE);
    const exact = f(f(record.cell[a]! - i32[CAM_CELL_INT_INDEX + a]!) + f(offsetFrac * edgeCells));
    const relCells = f(
      f(exact - f32[CAM_FRAC_FLOAT_INDEX + a]!) - f32[CAM_FRAC_LO_FLOAT_INDEX + a]!,
    );
    out[a] = f(relCells * f32[CELL_EDGE_MPC_FLOAT_INDEX]!);
  }
  return out;
}
