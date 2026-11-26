import type { SliderProps } from '../../../../../../../packages/shared/src/components/common/Slider/Slider';
import type { GridSlice } from '../../../../../@types/grid/GridSlice';
import { deriveGridBox } from '../../../../grid/deriveGridBox';
import { voxelSizeFloorMpc } from '../../../../grid/voxelSize/voxelSizeFloorMpc';
import { COARSEST_LONG_AXIS_VOXELS } from '../data/coarsestLongAxisVoxels.constant';
import { VOXEL_SIZE_MAX_MPC } from '../data/voxelSizeMaxMpc.constant';
import { VOXEL_SIZE_MIN_MPC } from '../data/voxelSizeMinMpc.constant';
import { VOXEL_SIZE_STEP_LOG10 } from '../../../../grid/voxelSize/voxelSizeStepLog10.constant';

/**
 * voxelSizeSliderFor — the voxel-size slider in log10 Mpc, since its range runs
 * from 0.25 Mpc to hundreds for a Gpc-wide catalog. The top end grows to the
 * voxel size that puts the requested box's long axis at COARSEST_LONG_AXIS_VOXELS,
 * so any box can be coarsened to a small grid; it reads the request, not the
 * built box, so it holds still while the slider moves. The range always holds
 * the value: the device floor and an imported box can sit outside the usual one.
 */
export function voxelSizeSliderFor(
  grid: GridSlice,
): Required<Pick<SliderProps, 'value' | 'min' | 'max' | 'step'>> {
  const valueMpc = deriveGridBox(grid).voxelSizeMpc;
  const floorMpc = Math.max(VOXEL_SIZE_MIN_MPC, voxelSizeFloorMpc(grid) ?? 0);
  const longAxisMpc = Math.max(...grid.manualSizeMpc);
  const maxMpc = Math.max(
    VOXEL_SIZE_MAX_MPC,
    longAxisMpc / COARSEST_LONG_AXIS_VOXELS,
    floorMpc,
    valueMpc,
  );
  return {
    value: Math.log10(valueMpc),
    min: Math.log10(Math.min(floorMpc, valueMpc)),
    max: Math.log10(maxMpc),
    step: VOXEL_SIZE_STEP_LOG10,
  };
}
