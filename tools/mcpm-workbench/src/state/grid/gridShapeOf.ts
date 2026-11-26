import type { GridSlice } from '../../../@types/grid/GridSlice';
import type { GridShape } from '../../../@types/grid/GridShape';

/**
 * gridShapeOf — the single home for "which GridSlice fields shape the box," so `gridShapeKeyFor`
 * (preview timer) doesn't hand-spell its own field list — a rotate-drag bug once shipped because
 * `manualRotation` was added to one hand-spelled list and missed in another. `watchSceneSaga`'s
 * structural trigger-action list (a hand enumeration of the ACTIONS that write these fields, not
 * a value diff) is the other consumer this Pick has to stay in sync with by hand: a field added
 * here needs its setter action added there too.
 */
export function gridShapeOf(grid: GridSlice): GridShape {
  return {
    manualCenterMpc: grid.manualCenterMpc,
    manualSizeMpc: grid.manualSizeMpc,
    manualRotation: grid.manualRotation,
    manualVoxelSizeMpc: grid.manualVoxelSizeMpc,
  };
}
