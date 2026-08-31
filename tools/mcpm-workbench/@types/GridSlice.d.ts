import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { GridBox } from './GridBox';
import type { GridBudget } from './GridBudget';
import type { GridElement } from './GridElement';

/**
 * GridSlice — the grid-box CONFIG (what the panel edits) plus the last
 * RESOLVED box (what the sim runs on); `box`/`resolvedElement`/`byteBudget`
 * are null until the first successful build. The manual path (center + size
 * + a directly-stored `manualVoxelSizeMpc`) is the only resolution lever — a
 * physical Mpc size, not a scale factor, so resolution stays stable under
 * resize/refit (grid-voxel-size-currency decision, Q1/Q2).
 *
 * `importedBox` (V3): `deriveGridBox` returns it VERBATIM when set, so a
 * loaded preset reloads bit-identical; every setter representing a grid
 * edit (including `fitBoxToCatalog`) clears it back to null. `showGridBox`
 * (F1.7) is view state, not a grid edit — its setter does NOT clear
 * `importedBox` and it is never written into a preset.
 *
 * `manualRotation` (F2.5) mirrors center/size's manual-path shape:
 * `deriveGridBox` writes it into the derived box (`autoFitGridBox` always
 * returns identity), and `installImportedBox` syncs it from a loaded preset
 * so a drag on a loaded rotated box doesn't snap back to identity.
 *
 * `maxBufferBytes` (V2), the device's real allocation ceiling, clamps
 * `manualVoxelSizeMpc` up in `deriveGridBox`; set only by
 * `setMaxBufferBytes`, which — like `setResolvedGrid` — does NOT clear
 * `importedBox`.
 */
export type GridSlice = {
  readonly manualVoxelSizeMpc: number;
  readonly paddingMpc: number;
  readonly manualCenterMpc: Vec3;
  readonly manualSizeMpc: Vec3;
  readonly manualRotation: Readonly<Vec4>;
  readonly importedBox: GridBox | null;
  readonly box: GridBox | null;
  readonly resolvedElement: GridElement | null;
  readonly byteBudget: GridBudget | null;
  readonly showGridBox: boolean;
  readonly maxBufferBytes: number | null;
};
