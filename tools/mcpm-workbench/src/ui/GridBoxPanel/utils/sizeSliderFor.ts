import type { SliderProps } from '../../../../../../src/components/common/Slider/Slider';
import type { GridBox } from '../../../../@types/GridBox';
import { SIZE_MAX_MPC } from './SIZE_MAX_MPC';

/**
 * sizeSliderFor — a size slider shows the box the sim builds, so its value is
 * `box.sizeMpc` (dims × voxelSizeMpc), never the stored request, and it steps
 * in whole 8-voxel blocks: the grid can only be built in those (autoFitGridBox).
 * An imported box keeps its own, possibly off-lattice, size.
 */
export function sizeSliderFor(
  box: GridBox,
  axis: 0 | 1 | 2,
): Required<Pick<SliderProps, 'value' | 'min' | 'max' | 'step'>> {
  const step = 8 * box.voxelSizeMpc;
  const maxDims = Math.max(1, Math.floor(SIZE_MAX_MPC / step)) * 8;
  return { value: box.sizeMpc[axis], min: step, max: maxDims * box.voxelSizeMpc, step };
}
