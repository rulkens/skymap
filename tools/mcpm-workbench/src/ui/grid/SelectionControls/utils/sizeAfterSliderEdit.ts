import type { Vec3 } from '../../../../../../../packages/shared/src/@types/math/Vec3';
import type { GridSlice } from '../../../../../@types/grid/GridSlice';
import { deriveGridBox } from '../../../../grid/deriveGridBox';
import { builtAxisSizeMpc } from './builtAxisSizeMpc';
import { withAxis } from '../../../../../../../src/utils/math/withAxis';

/**
 * sizeAfterSliderEdit — the `manualSizeMpc` a size-slider edit writes: the
 * edited axis at the whole-block count whose built size lands nearest the
 * slider value, the other axes as requested. Near the device limit the voxel
 * floor moves with every edit, so the count is picked by its built size
 * (builtAxisSizeMpc), not by the current voxel size. The axis is written as
 * built, so request and result coincide and a step out and back is exact. A
 * changed value always moves at least one block its way, or a floor jump
 * could leave a key press with nothing to show.
 */
export function sizeAfterSliderEdit(grid: GridSlice, axis: 0 | 1 | 2, valueMpc: number): Vec3 {
  const box = deriveGridBox(grid);
  const sizeAt = (dims: number) => builtAxisSizeMpc(grid, axis, dims);
  let dims = Math.max(8, Math.round(valueMpc / (8 * box.voxelSizeMpc)) * 8);
  while (dims > 8 && sizeAt(dims) > valueMpc) dims -= 8;
  while (sizeAt(dims + 8) <= valueMpc) dims += 8;
  if (sizeAt(dims + 8) - valueMpc < valueMpc - sizeAt(dims)) dims += 8;
  const shownDims = box.dims[axis];
  if (valueMpc > box.sizeMpc[axis]) dims = Math.max(dims, shownDims + 8);
  if (valueMpc < box.sizeMpc[axis]) dims = Math.max(8, Math.min(dims, shownDims - 8));
  return withAxis(grid.manualSizeMpc, axis, sizeAt(dims));
}
