import type { GridSlice } from '../../@types/GridSlice';

/** The GridSlice fields that reshape the grid box: a gizmo/slider edit into any of these
 *  changes what the box IS, not just where the sim points at it. `paddingMpc` is deliberately
 *  excluded — deriveGridBox always calls autoFitGridBox with padding 0 (it's a one-shot input
 *  to the NEXT "auto fit" click, baked into manualSizeMpc at that point, not a live modifier),
 *  so a padding edit alone can never change the derived box. */
export type GridShape = Pick<
  GridSlice,
  'manualCenterMpc' | 'manualSizeMpc' | 'manualRotation' | 'manualVoxelSizeMpc'
>;

/**
 * gridShapeOf — the single home for "which GridSlice fields shape the box," so `buildKey`
 * (rebuild trigger) and `gridShapeKeyFor` (preview timer) both serialize from this Pick instead
 * of hand-spelling the field list twice — a rotate-drag bug once shipped because
 * `manualRotation` was added to one hand-spelled list and missed in the other; adding a field
 * here is the one edit both consumers pick up.
 */
export function gridShapeOf(grid: GridSlice): GridShape {
  return {
    manualCenterMpc: grid.manualCenterMpc,
    manualSizeMpc: grid.manualSizeMpc,
    manualRotation: grid.manualRotation,
    manualVoxelSizeMpc: grid.manualVoxelSizeMpc,
  };
}
