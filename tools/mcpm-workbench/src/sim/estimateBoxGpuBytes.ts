import type { GridSlice } from '../../@types/GridSlice';
import { deriveGridBox } from '../field/deriveGridBox';
import { estimateGridBudgetBytes } from './planGridBudget';

/**
 * estimateBoxGpuBytes — the GPU memory of the box as set now rather than the last
 * completed build's, so it follows a size drag. Agent lanes only: how many catalog
 * points fall inside the box is known once the build has culled them.
 */
export function estimateBoxGpuBytes(grid: GridSlice, agentCount: number): number {
  // deriveGridBox's own pre-first-build fallback; the two must match.
  return estimateGridBudgetBytes(
    deriveGridBox(grid).dims,
    agentCount,
    grid.resolvedElement ?? 'f32',
  );
}
