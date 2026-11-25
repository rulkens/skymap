import type { GridSlice } from '../../@types/GridSlice';
import { BYTES_PER_ELEMENT } from '../sim/createGridBuffers';
import { DECAY_WG_EDGE } from '../sim/encodeStep';
import { estimateBoxGridBufferBytes } from '../sim/estimateBoxGridBufferBytes';
import { GPU_BUFFER_ZONE_FROM } from '../sim/GPU_BUFFER_ZONE_FROM';
import { gridElementOf } from './gridElementOf';
import { VOXEL_SIZE_STEP_LOG10 } from './VOXEL_SIZE_STEP_LOG10';

/**
 * voxelSizeFittingMemory — the voxel size Auto fit leaves: the current one when
 * the GPU bar (estimateBoxGridBufferBytes against the device limit) stays below
 * its warn zone or the limit is unknown, else the smallest voxel size on the
 * slider's lattice that brings it there. The unrounded cube root is a lower
 * bound (ceil8 only grows dims), so the walk up from it is a step or two for
 * any box big enough to need it. Past every axis at 8 voxels nothing shrinks.
 */
export function voxelSizeFittingMemory(grid: GridSlice): number {
  const limitBytes = grid.maxBufferBytes;
  if (limitBytes === null || grid.importedBox) return grid.manualVoxelSizeMpc;
  const fitsAt = (voxelSizeMpc: number) =>
    estimateBoxGridBufferBytes({ ...grid, manualVoxelSizeMpc: voxelSizeMpc }) / limitBytes <
    GPU_BUFFER_ZONE_FROM.warn;
  if (fitsAt(grid.manualVoxelSizeMpc)) return grid.manualVoxelSizeMpc;

  const [x, y, z] = grid.manualSizeMpc;
  const elementBytes = BYTES_PER_ELEMENT[gridElementOf(grid)];
  const lowerBoundMpc = Math.cbrt(
    (x * y * z * elementBytes) / (GPU_BUFFER_ZONE_FROM.warn * limitBytes),
  );
  const stepOf = (voxelSizeMpc: number) =>
    Math.ceil(Math.log10(voxelSizeMpc) / VOXEL_SIZE_STEP_LOG10);
  const lastStep = stepOf(Math.max(x, y, z) / DECAY_WG_EDGE);
  let step = stepOf(Math.max(lowerBoundMpc, grid.manualVoxelSizeMpc));
  while (step < lastStep && !fitsAt(10 ** (step * VOXEL_SIZE_STEP_LOG10))) step++;
  return 10 ** (step * VOXEL_SIZE_STEP_LOG10);
}
