import type { GridBox } from '../../@types/GridBox';
import type { GridSlice } from '../../@types/GridSlice';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
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
 * deriveGridBox — the ONE place grid-panel config becomes the actual
 * simulated GridBox. Viewport calls this to build the harness;
 * GridBoxPanel's dims readout calls it too, from the same state, so the two
 * can never disagree about what "the box" is. Derivation is always the
 * manual path — center + size (`manualBounds`) at the panel's
 * `manualVoxelSizeMpc` — since "auto fit" (`fitBoxToCatalog`, gridSlice.ts)
 * is a one-shot action that writes those same fields rather than a
 * persistent mode this function has to branch on; padding is baked into
 * `manualSizeMpc` at that point, so `autoFitGridBox` is always called with
 * padding 0 here — adding `grid.paddingMpc` again on top would double-pad
 * every derivation after a fit. Never null: `manualCenterMpc`/`manualSizeMpc`
 * always have a value.
 *
 * `grid.importedBox` (V3) short-circuits all of the above: a loaded preset's
 * box is returned VERBATIM, so the panel's dims readout and the harness both
 * see the exact box the preset was saved with, not a recomputation from the
 * current (possibly unrelated) voxel-size/manual state.
 *
 * `autoFitGridBox` itself has no rotation concept — it always returns
 * identity (see its own doc comment) — so the manual path's `rotation` comes
 * from `grid.manualRotation` (F2.5), applied AFTER fitting: rotation is an
 * orientation of the already-sized box, not an input to the dims/voxel-size
 * fit (which only ever cares about extent magnitudes, never direction).
 */
export function deriveGridBox(grid: GridSlice): GridBox {
  if (grid.importedBox) return grid.importedBox;
  const bounds = manualBounds(grid.manualCenterMpc, grid.manualSizeMpc);
  const box = autoFitGridBox(bounds, grid.manualVoxelSizeMpc, 0);
  return { ...box, rotation: grid.manualRotation };
}
