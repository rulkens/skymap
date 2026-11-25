import type { GridSlice } from '../../../@types/grid/GridSlice';
import type { SimLaneCounts } from '../../../@types/sim/SimLaneCounts';
import { DECAY_WG_EDGE } from '../../sim/encodeStep';
import { estimateBoxGpuBytes } from '../../sim/memory/estimateBoxGpuBytes';
import { simMemoryZone } from '../../sim/memory/simMemoryZone';
import { VOXEL_SIZE_STEP_LOG10 } from './voxelSizeStepLog10.constant';

/**
 * voxelSizeFittingMemory — the voxel size Auto fit leaves: the current one when
 * the GPU bar (the sim's total memory, simMemoryZone) stays out of its warn zone
 * or the limit is unknown, else the smallest voxel size on the slider's lattice
 * that brings it there. Memory only falls as voxels grow, so a bisection between
 * the current size and every axis at 8 voxels finds it; when the lanes alone
 * fill the warn zone, no grid fits and the coarsest one is the answer.
 */
export function voxelSizeFittingMemory(grid: GridSlice, lanes: SimLaneCounts): number {
  const limitBytes = grid.maxBufferBytes;
  if (limitBytes === null || grid.importedBox) return grid.manualVoxelSizeMpc;
  const voxelAt = (step: number) => 10 ** (step * VOXEL_SIZE_STEP_LOG10);
  const fitsAt = (voxelSizeMpc: number) => {
    const usedBytes = estimateBoxGpuBytes(
      { ...grid, manualVoxelSizeMpc: voxelSizeMpc },
      lanes.agentCount,
      lanes.pointCount,
    );
    return simMemoryZone(usedBytes, limitBytes) === 'normal';
  };
  if (fitsAt(grid.manualVoxelSizeMpc)) return grid.manualVoxelSizeMpc;

  const stepOf = (voxelSizeMpc: number) =>
    Math.ceil(Math.log10(voxelSizeMpc) / VOXEL_SIZE_STEP_LOG10);
  let lo = stepOf(grid.manualVoxelSizeMpc);
  let hi = Math.max(lo, stepOf(Math.max(...grid.manualSizeMpc) / DECAY_WG_EDGE));
  if (!fitsAt(voxelAt(hi))) return voxelAt(hi);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsAt(voxelAt(mid))) hi = mid;
    else lo = mid + 1;
  }
  return voxelAt(lo);
}
