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
 * current (possibly unrelated) voxel-size/manual state. Deliberately
 * UNCLAMPED (V2): a preset busting this device's limit refuses at build with
 * planGridBudget's existing error — round-trip fidelity beats silent mutation.
 *
 * `autoFitGridBox` itself has no rotation concept — it always returns
 * identity (see its own doc comment) — so the manual path's `rotation` comes
 * from `grid.manualRotation` (F2.5), applied AFTER fitting: rotation is an
 * orientation of the already-sized box, not an input to the dims/voxel-size
 * fit (which only ever cares about extent magnitudes, never direction).
 *
 * V2: the manual voxel size is clamped UP to `minFeasibleVoxelSizeMpc`'s floor
 * once `grid.maxBufferBytes` is known (null pre-init — nothing to clamp
 * against yet). `elementBytes` resolves the same `resolvedElement ?? 'f32'`
 * way GridBoxPanel's readout does, so the two can't disagree. Fix round 1: an
 * `Infinity` floor (no voxel size fits at all — a `maxBufferBytes` below the
 * 8³-voxel minimum, unreachable on any real device) is treated as "no usable
 * floor", same as null, rather than poisoning the box with an infinite voxel size.
 */
export function deriveGridBox(grid: GridSlice): GridBox {
  if (grid.importedBox) return grid.importedBox;
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
  const box = autoFitGridBox(bounds, effectiveVoxelSizeMpc, 0);
  return { ...box, rotation: grid.manualRotation };
}
