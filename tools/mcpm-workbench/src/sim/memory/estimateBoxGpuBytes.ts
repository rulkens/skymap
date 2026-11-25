import type { GridSlice } from '../../../@types/grid/GridSlice';
import { deriveGridBox } from '../../grid/deriveGridBox';
import { gridElementOf } from '../../grid/gridElementOf';
import { estimateGridBudgetBytes } from './planGridBudget';

/**
 * estimateBoxGpuBytes — the GPU memory of the box as set now rather than the last
 * completed build's, so it follows a size drag. Catalog points share the agent
 * lanes (createMcpmHarness sizes them points + agents); the build counts only the
 * points inside the box, so the loaded count makes this an upper bound.
 */
export function estimateBoxGpuBytes(
  grid: GridSlice,
  agentCount: number,
  pointCount: number,
): number {
  return estimateGridBudgetBytes(
    deriveGridBox(grid).dims,
    pointCount + agentCount,
    gridElementOf(grid),
  );
}
