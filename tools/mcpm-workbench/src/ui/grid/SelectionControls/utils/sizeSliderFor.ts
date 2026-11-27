import type { SliderProps } from '../../../../../../../packages/shared/src/components/common/Slider/Slider';
import type { GridBox } from '../../../../../@types/grid/GridBox';
import { ceil8 } from '../../../../utils/math/ceil8';
import { SIZE_MAX_MPC } from '../data/sizeMaxMpc.constant';

/**
 * sizeSliderFor — a size slider shows the box the sim builds, so its value is
 * `box.sizeMpc` (dims × voxelSizeMpc), never the stored request, and it steps
 * in whole 8-voxel blocks: the grid can only be built in those (autoFitGridBox).
 * An imported box keeps its own, possibly off-lattice, size. The top end
 * stretches to a wider box (auto fit, the voxel floor), since Slider clamps
 * every key press and click into its range and would otherwise shrink the box.
 */
export function sizeSliderFor(
  box: GridBox,
  axis: 0 | 1 | 2,
): Required<Pick<SliderProps, 'value' | 'min' | 'max' | 'step'>> {
  const step = 8 * box.voxelSizeMpc;
  const maxDims = Math.max(
    Math.max(1, Math.floor(SIZE_MAX_MPC / step)) * 8,
    ceil8(box.sizeMpc[axis] / box.voxelSizeMpc),
  );
  return { value: box.sizeMpc[axis], min: step, max: maxDims * box.voxelSizeMpc, step };
}
