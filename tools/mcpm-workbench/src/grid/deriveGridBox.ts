import type { GridBox } from '../../@types/grid/GridBox';
import type { GridSlice } from '../../@types/grid/GridSlice';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { autoFitGridBox } from './autoFit/autoFitGridBox';
import { boxHalfExtentMpc } from './box/boxHalfExtentMpc';
import { voxelSizeFloorMpc } from './voxelSize/voxelSizeFloorMpc';

function manualBounds(center: Vec3, size: Vec3): { min: Vec3; max: Vec3 } {
  const half = boxHalfExtentMpc(size);
  return {
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
  };
}

/**
 * deriveGridBox — the ONE place the Selection config becomes the simulated
 * GridBox; Viewport and SelectionControls share this call so they
 * can't disagree about what "the box" is. `grid.importedBox` returns
 * VERBATIM and UNCLAMPED — a preset busting the device limit refuses at
 * build (planGridBudget) instead of being silently resized. Otherwise:
 * `manualVoxelSizeMpc` clamped UP to `voxelSizeFloorMpc`, then
 * `grid.manualRotation` applies AFTER fitting — `autoFitGridBox`
 * itself carries no rotation concept.
 */
export function deriveGridBox(grid: GridSlice): GridBox {
  if (grid.importedBox) return grid.importedBox;
  const effectiveVoxelSizeMpc = Math.max(grid.manualVoxelSizeMpc, voxelSizeFloorMpc(grid) ?? 0);
  const bounds = manualBounds(grid.manualCenterMpc, grid.manualSizeMpc);
  // padding 0: fitBoxToCatalog already baked grid.paddingMpc into manualSizeMpc at fit
  // time — re-adding it here would double-pad every derivation after that fit.
  const box = autoFitGridBox(bounds, effectiveVoxelSizeMpc, 0);
  return { ...box, rotation: grid.manualRotation };
}
