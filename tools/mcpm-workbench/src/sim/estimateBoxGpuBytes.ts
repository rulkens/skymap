import type { GridSlice } from '../../@types/GridSlice';
import { deriveGridBox } from '../field/deriveGridBox';
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
  // voxelSizeFloorMpc's own pre-first-build fallback; the two must match.
  return estimateGridBudgetBytes(
    deriveGridBox(grid).dims,
    pointCount + agentCount,
    grid.resolvedElement ?? 'f32',
  );
}
