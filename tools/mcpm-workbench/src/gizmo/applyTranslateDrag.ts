import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../@types/GridBox';

/** applyTranslateDrag — new `centerMpc = box.centerMpc + axisDir * deltaMpc` (spec §5's "Drag
 *  math"). Pure and rotation-agnostic: `axisDir` carries whatever axis F1 (UNIT_AXES) or F2
 *  (`boxBasisVectors`) supplies. */
export function applyTranslateDrag(box: GridBox, axisDir: Readonly<Vec3>, deltaMpc: number): Vec3 {
  return [
    box.centerMpc[0] + axisDir[0] * deltaMpc,
    box.centerMpc[1] + axisDir[1] * deltaMpc,
    box.centerMpc[2] + axisDir[2] * deltaMpc,
  ];
}
