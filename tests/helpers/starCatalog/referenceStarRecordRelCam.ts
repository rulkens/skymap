/**
 * referenceStarRecordRelCam: the executable reference for `vertex.wesl`'s world
 * reconstruction (`recordRelCamCells` in `cutIo.wesl`, times `cellEdgeMpc`), its
 * integer steps in exact integers and its float steps rounded to f32 as the GPU
 * rounds them, so tests can pin the precision of a star's camera-relative
 * position. The two must change together, operation for operation.
 */

import type { ReferenceStarRecord } from './@types/ReferenceStarRecord';
import {
  CAM_CELL_INT_INDEX,
  CAM_FRAC_FLOAT_INDEX,
  CAM_SUB_FLOAT_INDEX,
  CELL_EDGE_MPC_FLOAT_INDEX,
  EXACT_CELLS,
} from '../../../src/services/gpu/octree/octreeCutLayout';
import { OFFSET_FRACTION_LEVELS } from '../../../src/data/octree/octreeFormat';

export function referenceStarRecordRelCam(
  uniforms: ArrayBuffer,
  record: ReferenceStarRecord,
): [number, number, number] {
  const i32 = new Int32Array(uniforms);
  const f32 = new Float32Array(uniforms);
  const f = Math.fround;
  const out: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const scaled = record.offset[a]! * 2 ** record.level;
    const cells =
      record.cell[a]! - i32[CAM_CELL_INT_INDEX + a]! + Math.floor(scaled / OFFSET_FRACTION_LEVELS);
    const near = Math.max(-EXACT_CELLS, Math.min(EXACT_CELLS, cells));
    const camWhole = Math.floor(f32[CAM_FRAC_FLOAT_INDEX + a]! * OFFSET_FRACTION_LEVELS);
    const sub = near * OFFSET_FRACTION_LEVELS + (scaled % OFFSET_FRACTION_LEVELS) - camWhole;
    const relCells = f(
      f(f(f(sub) - f32[CAM_SUB_FLOAT_INDEX + a]!) / OFFSET_FRACTION_LEVELS) + f(cells - near),
    );
    out[a] = f(relCells * f32[CELL_EDGE_MPC_FLOAT_INDEX]!);
  }
  return out;
}
