import type { GridBox } from '../../@types/GridBox';
import type { GridSlice } from '../../@types/GridSlice';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { autoFitGridBox } from './autoFitGridBox';

// divisor 1 = the tool's long-standing 256 default; >1 coarser, <1 finer —
// same direction as the raymarch preview divisor (view.raymarch.divisor).
export const BASE_LONG_AXIS = 256;

function longAxisFor(divisor: number): number {
  return Math.round(BASE_LONG_AXIS / divisor);
}

function manualBounds(center: Vec3, size: Vec3): { min: Vec3; max: Vec3 } {
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  return {
    min: [center[0] - half[0], center[1] - half[1], center[2] - half[2]],
    max: [center[0] + half[0], center[1] + half[1], center[2] + half[2]],
  };
}

/**
 * deriveGridBox — the ONE place grid-panel config + the loaded catalog's
 * bounds become the actual simulated GridBox. Viewport calls this to build
 * the harness; GridBoxPanel's dims readout calls it too, from the same
 * state, so the two can never disagree about what "the box" is. Null when
 * auto-fit is on but no catalog has finished loading yet — there is nothing
 * to fit around.
 *
 * `grid.importedBox` (V3) short-circuits all of the above: a loaded preset's
 * box is returned VERBATIM, so the panel's dims readout and the harness both
 * see the exact box the preset was saved with, not a recomputation from the
 * current (possibly unrelated) autoFit/divisor/manual state.
 */
export function deriveGridBox(
  grid: GridSlice,
  catalogBoundsMpc: { min: Vec3; max: Vec3 } | null,
): GridBox | null {
  if (grid.importedBox) return grid.importedBox;
  const bounds = grid.autoFit
    ? catalogBoundsMpc
    : manualBounds(grid.manualCenterMpc, grid.manualSizeMpc);
  if (!bounds) return null;
  const paddingMpc = grid.autoFit ? grid.paddingMpc : 0;
  return autoFitGridBox(bounds, longAxisFor(grid.divisor), paddingMpc);
}
