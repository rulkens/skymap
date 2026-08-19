import type { GridSlice } from '../../@types/GridSlice';

/** The GridSlice fields that reshape the grid box: a gizmo/slider edit into any of these
 *  changes what the box IS, not just where the sim points at it. */
export type GridShape = Pick<
  GridSlice,
  'manualCenterMpc' | 'manualSizeMpc' | 'manualRotation' | 'manualVoxelSizeMpc' | 'paddingMpc'
>;

/**
 * gridShapeOf — the single home for "which GridSlice fields shape the box," so `buildKey`
 * (rebuild trigger) and `gridShapeKeyFor` (preview timer) both serialize from this Pick instead
 * of hand-spelling the field list twice. F2.5's rotate-drag bug happened because
 * `manualRotation` was added to one hand-spelled list and missed in the other; adding a field
 * here is now the one edit both consumers pick up (see buildKey.ts's docstring for the incident).
 */
export function gridShapeOf(grid: GridSlice): GridShape {
  return {
    manualCenterMpc: grid.manualCenterMpc,
    manualSizeMpc: grid.manualSizeMpc,
    manualRotation: grid.manualRotation,
    manualVoxelSizeMpc: grid.manualVoxelSizeMpc,
    paddingMpc: grid.paddingMpc,
  };
}
