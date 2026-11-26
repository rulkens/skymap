import type { SliderProps } from '../../../../../../../packages/shared/src/components/common/Slider/Slider';
import type { CatalogSlice } from '../../../../../@types/catalog/CatalogSlice';
import type { GridSlice } from '../../../../../@types/grid/GridSlice';
import { CENTER_RANGE_MPC } from '../data/centerRangeMpc.constant';
import { CENTER_STEP_MPC } from '../data/centerStepMpc.constant';

/**
 * centerSliderFor — a centre slider reaches ±CENTER_RANGE_MPC, widened to the
 * loaded catalog's reach on that axis and to the centre itself, since Slider
 * clamps every key press into its range. The catalog keeps the range still
 * while the centre is dragged across it: a range sized from the centre alone
 * would rescale under the pointer and run the drag away.
 */
export function centerSliderFor(
  grid: GridSlice,
  catalogBoundsMpc: CatalogSlice['catalogBoundsMpc'],
  axis: 0 | 1 | 2,
): Required<Pick<SliderProps, 'value' | 'min' | 'max' | 'step'>> {
  const value = grid.manualCenterMpc[axis];
  const catalogReachMpc = catalogBoundsMpc
    ? Math.max(Math.abs(catalogBoundsMpc.min[axis]), Math.abs(catalogBoundsMpc.max[axis]))
    : 0;
  const reach =
    Math.ceil(Math.max(CENTER_RANGE_MPC, catalogReachMpc, Math.abs(value)) / CENTER_STEP_MPC) *
    CENTER_STEP_MPC;
  return { value, min: -reach, max: reach, step: CENTER_STEP_MPC };
}
