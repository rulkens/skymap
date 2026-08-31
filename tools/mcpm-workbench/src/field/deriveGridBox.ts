import type { GridBox } from '../../@types/GridBox';
import type { GridSlice } from '../../@types/GridSlice';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { BYTES_PER_ELEMENT } from '../sim/createGridBuffers';
import { minFeasibleVoxelSizeMpc } from '../sim/minFeasibleVoxelSizeMpc';
import { autoFitGridBox } from './autoFitGridBox';
import { boxHalfExtentMpc } from './boxHalfExtentMpc';

function manualBounds(center: Vec3, size: Vec3): { min: Vec3; max: Vec3 } {
  const half = boxHalfExtentMpc(size);
  return {
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
  };
}

/**
 * deriveGridBox — the ONE place grid-panel config becomes the simulated
 * GridBox; Viewport and GridBoxPanel's dims readout share this call so they
 * can't disagree about what "the box" is. `grid.importedBox` (V3) returns
 * VERBATIM and UNCLAMPED — a preset busting the device limit refuses at
 * build (planGridBudget) instead of being silently resized. Otherwise:
 * `manualVoxelSizeMpc` clamped UP to `minFeasibleVoxelSizeMpc`'s floor
 * (`Infinity` floor = "no floor", not an infinite voxel size), then
 * `grid.manualRotation` (F2.5) applies AFTER fitting — `autoFitGridBox`
 * itself carries no rotation concept.
 */
export function deriveGridBox(grid: GridSlice): GridBox {
  if (grid.importedBox) return grid.importedBox;
  // `?? 'f32'` (pre-first-build fallback) must match GridBoxPanel.tsx's two copies of
  // this same fallback, or the memory readout and the box the sim actually builds disagree.
  const rawFloorMpc =
    grid.maxBufferBytes === null
      ? 0
      : minFeasibleVoxelSizeMpc(
          grid.manualSizeMpc,
          BYTES_PER_ELEMENT[grid.resolvedElement ?? 'f32'],
          grid.maxBufferBytes,
        );
  const floorMpc = Number.isFinite(rawFloorMpc) ? rawFloorMpc : 0;
  const effectiveVoxelSizeMpc = Math.max(grid.manualVoxelSizeMpc, floorMpc);
  const bounds = manualBounds(grid.manualCenterMpc, grid.manualSizeMpc);
  // padding 0: fitBoxToCatalog already baked grid.paddingMpc into manualSizeMpc at fit
  // time — re-adding it here would double-pad every derivation after that fit.
  const box = autoFitGridBox(bounds, effectiveVoxelSizeMpc, 0);
  return { ...box, rotation: grid.manualRotation };
}
