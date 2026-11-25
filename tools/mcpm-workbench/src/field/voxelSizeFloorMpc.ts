import type { GridSlice } from '../../@types/GridSlice';
import type { PinnedAxisDims } from '../../@types/PinnedAxisDims';
import { BYTES_PER_ELEMENT } from '../sim/createGridBuffers';
import { minFeasibleVoxelSizeMpc } from '../sim/minFeasibleVoxelSizeMpc';
import { gridElementOf } from './gridElementOf';

/**
 * voxelSizeFloorMpc — the smallest voxel size the requested box fits the device
 * at, or null when there is no usable floor: device limit unknown (before the
 * first GPU init) or no voxel size fits at all.
 */
export function voxelSizeFloorMpc(grid: GridSlice, pinned?: PinnedAxisDims): number | null {
  if (grid.maxBufferBytes === null) return null;
  const floorMpc = minFeasibleVoxelSizeMpc(
    grid.manualSizeMpc,
    BYTES_PER_ELEMENT[gridElementOf(grid)],
    grid.maxBufferBytes,
    pinned,
  );
  return Number.isFinite(floorMpc) ? floorMpc : null;
}
