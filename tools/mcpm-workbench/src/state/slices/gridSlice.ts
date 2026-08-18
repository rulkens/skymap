import type { GridSlice } from '../../../@types/GridSlice';
import type { GridBox } from '../../../@types/GridBox';
import type { GridBudget } from '../../../@types/GridBudget';
import type { GridElement } from '../../../@types/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * defaultGridSlice — the manual 200 Mpc origin-centred cube is the boot
 * view (an auto-fit-on-boot box would stretch to the catalog's outliers
 * until the local volume is a sliver of it). `divisor: 1` is
 * `deriveGridBox`'s BASE_LONG_AXIS (256) unscaled; divisor 0.75 covers
 * Phase 1's "a ≥300-class grid runs continuously" exit criterion at 341
 * (S12 added a finer 0.5 notch above it, 512 long axis).
 */
export const defaultGridSlice: GridSlice = {
  divisor: 1,
  paddingMpc: 5,
  manualCenterMpc: [0, 0, 0],
  manualSizeMpc: [200, 200, 200],
  importedBox: null,
  box: null,
  resolvedElement: null,
  byteBudget: null,
  showGridBox: true,
};

// V3 ruling: every setter below a user reaches through the grid-controls UI
// clears `importedBox` — a loaded preset's box wins until the user steers
// the controls again, then the override has to die (setResolvedGrid, below,
// is NOT one of these: it records a completed build, not a user edit).
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

/**
 * installImportedBox — V3's load-side setter: installs a preset's grid box
 * verbatim AND syncs the manual center/size fields to match, so the sliders
 * (which read manualCenterMpc/manualSizeMpc directly, not importedBox) show
 * the loaded values instead of stale ones (S17). importedBox still wins in
 * deriveGridBox until a later edit clears it — this sync only makes a later
 * slider nudge continue FROM the imported box instead of snapping to it.
 */
export function installImportedBox(prev: GridSlice, importedBox: GridBox): GridSlice {
  return {
    ...prev,
    importedBox,
    manualCenterMpc: importedBox.centerMpc,
    manualSizeMpc: importedBox.sizeMpc,
  };
}

/**
 * fitBoxToCatalog — "auto fit" as a one-shot ACTION, not a persistent mode:
 * snapshots `boundsMpc` into `manualCenterMpc`/`manualSizeMpc` once, and
 * from then on the box is an ordinary manual one (editable, survives a
 * catalog reload, etc — no boolean remembers how it got here). `paddingMpc`
 * bakes in at click time: it's an input to the NEXT fit, not a live modifier
 * of whatever box is already showing. A grid-control edit per the V3 ruling,
 * so it clears `importedBox` too.
 */
export function fitBoxToCatalog(prev: GridSlice, boundsMpc: { min: Vec3; max: Vec3 }): GridSlice {
  const manualCenterMpc: Vec3 = [
    (boundsMpc.min[0] + boundsMpc.max[0]) / 2,
    (boundsMpc.min[1] + boundsMpc.max[1]) / 2,
    (boundsMpc.min[2] + boundsMpc.max[2]) / 2,
  ];
  const manualSizeMpc: Vec3 = [
    boundsMpc.max[0] - boundsMpc.min[0] + 2 * prev.paddingMpc,
    boundsMpc.max[1] - boundsMpc.min[1] + 2 * prev.paddingMpc,
    boundsMpc.max[2] - boundsMpc.min[2] + 2 * prev.paddingMpc,
  ];
  return { ...prev, manualCenterMpc, manualSizeMpc, importedBox: null };
}

/**
 * F1.7: persistent box-wireframe visibility, not a grid-control edit — unlike
 * every setter above, this does NOT clear `importedBox` (view state, no
 * bearing on which box is loaded).
 */
export function setShowGridBox(prev: GridSlice, showGridBox: boolean): GridSlice {
  return { ...prev, showGridBox };
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
