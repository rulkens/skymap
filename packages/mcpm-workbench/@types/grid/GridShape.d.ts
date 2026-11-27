import type { GridSlice } from './GridSlice';

/** The GridSlice fields that reshape the grid box: a gizmo/slider edit into any of these
 *  changes what the box IS, not just where the sim points at it. `paddingMpc` is deliberately
 *  excluded — deriveGridBox always calls autoFitGridBox with padding 0 (it's a one-shot input
 *  to the NEXT "auto fit" click, baked into manualSizeMpc at that point, not a live modifier),
 *  so a padding edit alone can never change the derived box. */
export type GridShape = Pick<
  GridSlice,
  'manualCenterMpc' | 'manualSizeMpc' | 'manualRotation' | 'manualVoxelSizeMpc'
>;
