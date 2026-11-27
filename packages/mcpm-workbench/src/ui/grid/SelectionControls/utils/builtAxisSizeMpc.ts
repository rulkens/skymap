import type { GridSlice } from '../../../../../@types/grid/GridSlice';
import { voxelSizeFloorMpc } from '../../../../grid/voxelSize/voxelSizeFloorMpc';

/**
 * builtAxisSizeMpc — the size one axis is built at when it holds `dims` voxels
 * and the other two keep their requests: dims × the voxel size deriveGridBox
 * would clamp to. Grows strictly with `dims`, since more voxels never lower the floor.
 */
export function builtAxisSizeMpc(grid: GridSlice, axis: 0 | 1 | 2, dims: number): number {
  const floorMpc = voxelSizeFloorMpc(grid, { axis, dims }) ?? 0;
  return dims * Math.max(grid.manualVoxelSizeMpc, floorMpc);
}
