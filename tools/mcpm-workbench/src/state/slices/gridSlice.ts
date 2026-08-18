import type { GridSlice } from '../../../@types/GridSlice';
import type { GridBox } from '../../../@types/GridBox';
import type { GridBudget } from '../../../@types/GridBudget';
import type { GridElement } from '../../../@types/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * defaultGridSlice — auto-fit OFF by user directive: the catalog's outliers
 * stretch an auto-fitted box until the local volume is a sliver of it, so the
 * manual 200 Mpc origin-centred cube is the better boot view. `divisor: 1`
 * is `deriveGridBox`'s BASE_LONG_AXIS (256) unscaled; divisor 0.75 covers
 * Phase 1's "a ≥300-class grid runs continuously" exit criterion at 341
 * (S12 added a finer 0.5 notch above it, 512 long axis).
 */
export const defaultGridSlice: GridSlice = {
  autoFit: false,
  divisor: 1,
  paddingMpc: 5,
  manualCenterMpc: [0, 0, 0],
  manualSizeMpc: [200, 200, 200],
  importedBox: null,
  box: null,
  resolvedElement: null,
  byteBudget: null,
};

// V3 ruling: every setter below a user reaches through the grid-controls UI
// clears `importedBox` — a loaded preset's box wins until the user steers
// the controls again, then the override has to die (setResolvedGrid, below,
// is NOT one of these: it records a completed build, not a user edit).
export function setAutoFit(prev: GridSlice, autoFit: boolean): GridSlice {
  return { ...prev, autoFit, importedBox: null };
}

export function setDivisor(prev: GridSlice, divisor: number): GridSlice {
  return { ...prev, divisor, importedBox: null };
}

export function setPaddingMpc(prev: GridSlice, paddingMpc: number): GridSlice {
  return { ...prev, paddingMpc, importedBox: null };
}

export function setManualCenterMpc(prev: GridSlice, manualCenterMpc: Vec3): GridSlice {
  return { ...prev, manualCenterMpc, importedBox: null };
}

export function setManualSizeMpc(prev: GridSlice, manualSizeMpc: Vec3): GridSlice {
  return { ...prev, manualSizeMpc, importedBox: null };
}

/** V3's load-side setter: installs a preset's grid box verbatim. */
export function setImportedBox(prev: GridSlice, importedBox: GridBox): GridSlice {
  return { ...prev, importedBox };
}

/** Records a completed fit: the resolved box, its element, and its byte budget. */
export function setResolvedGrid(
  prev: GridSlice,
  box: GridBox,
  resolvedElement: GridElement,
  byteBudget: GridBudget,
): GridSlice {
  return { ...prev, box, resolvedElement, byteBudget };
}
