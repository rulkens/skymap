import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import type { GridBox } from './GridBox';
import type { GridElement } from './GridElement';

/**
 * GridSlice — the Selection box as requested (the box itself is re-derived by
 * `deriveGridBox`, not stored) plus the last build's element, null until the
 * first build. The voxel size is a physical Mpc size, not a scale factor, so
 * resolution stays stable under resize and refit. `paddingMpc` and
 * `autoFitPercent` are inputs to the NEXT Auto fit, not live modifiers of the box.
 */
export type GridSlice = {
  readonly manualVoxelSizeMpc: number;
  readonly paddingMpc: number;
  readonly manualCenterMpc: Vec3;
  readonly manualSizeMpc: Vec3;
  /** Written into the derived box; synced from a loaded preset so a drag continues from it. */
  readonly manualRotation: Readonly<Vec4>;
  /** A loaded preset's box, returned VERBATIM until any grid edit clears it. */
  readonly importedBox: GridBox | null;
  readonly resolvedElement: GridElement | null;
  /** The device's per-buffer ceiling; `deriveGridBox` raises the voxel size to fit it. */
  readonly maxBufferBytes: number | null;
  /** Integer 80–100 (%): fraction of catalog points Auto fit keeps, evicting the
   * L∞-farthest-from-median fringe (see `denseFractionBounds`). */
  readonly autoFitPercent: number;
};
