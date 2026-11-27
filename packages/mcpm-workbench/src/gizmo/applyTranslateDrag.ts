import type { Vec3 } from '../../../shared/src/@types/math/Vec3';
import type { GridBox } from '../../@types/grid/GridBox';

/** applyTranslateDrag — new `centerMpc = box.centerMpc + axisDir * deltaMpc`. Pure and
 *  rotation-agnostic: `axisDir` is a UNIT_AXES or `boxBasisVectors` axis. */
export function applyTranslateDrag(box: GridBox, axisDir: Readonly<Vec3>, deltaMpc: number): Vec3 {
  return [
    box.centerMpc[0] + axisDir[0] * deltaMpc,
    box.centerMpc[1] + axisDir[1] * deltaMpc,
    box.centerMpc[2] + axisDir[2] * deltaMpc,
  ];
}
