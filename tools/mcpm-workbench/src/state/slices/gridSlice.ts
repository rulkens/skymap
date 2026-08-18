import type { GridSlice } from '../../../@types/GridSlice';
import type { GridBox } from '../../../@types/GridBox';
import type { GridBudget } from '../../../@types/GridBudget';
import type { GridElement } from '../../../@types/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * defaultGridSlice — auto-fit OFF by user directive: the catalog's outliers
 * stretch an auto-fitted box until the local volume is a sliver of it, so the
 * manual 200 Mpc origin-centred cube is the better boot view.
 * `longAxisTarget: 300` matches Phase 1's own "a ≥300-class grid runs
 * continuously" exit criterion.
 */
export const defaultGridSlice: GridSlice = {
  autoFit: false,
  longAxisTarget: 300,
  paddingMpc: 5,
  manualCenterMpc: [0, 0, 0],
  manualSizeMpc: [200, 200, 200],
  manualResolution: 128,
  box: null,
  resolvedElement: null,
  byteBudget: null,
};

export function setAutoFit(prev: GridSlice, autoFit: boolean): GridSlice {
  return { ...prev, autoFit };
}

export function setLongAxisTarget(prev: GridSlice, longAxisTarget: number): GridSlice {
  return { ...prev, longAxisTarget };
}

export function setPaddingMpc(prev: GridSlice, paddingMpc: number): GridSlice {
  return { ...prev, paddingMpc };
}

export function setManualCenterMpc(prev: GridSlice, manualCenterMpc: Vec3): GridSlice {
  return { ...prev, manualCenterMpc };
}

export function setManualSizeMpc(prev: GridSlice, manualSizeMpc: Vec3): GridSlice {
  return { ...prev, manualSizeMpc };
}

export function setManualResolution(prev: GridSlice, manualResolution: number): GridSlice {
  return { ...prev, manualResolution };
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
