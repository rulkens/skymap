import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { GridBox } from '../../../../@types/GridBox';
import { withAxis } from './withAxis';

/**
 * sizeAfterSliderEdit — the `manualSizeMpc` a size-slider edit writes: the
 * edited axis snapped to whole 8-voxel blocks, the others as built. Request
 * and result then coincide, so autoFitGridBox's round-up never swallows a
 * step down; it only acts on sizes from elsewhere (gizmo, auto fit, defaults).
 * `dims × voxelSizeMpc` is the exact expression autoFitGridBox builds sizeMpc with.
 */
export function sizeAfterSliderEdit(box: GridBox, axis: 0 | 1 | 2, valueMpc: number): Vec3 {
  const dims = Math.max(1, Math.round(valueMpc / (8 * box.voxelSizeMpc))) * 8;
  return withAxis(box.sizeMpc, axis, dims * box.voxelSizeMpc);
}
