import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { GridSlice } from '../../../@types/GridSlice';
import type { GridBox } from '../../../@types/GridBox';
import type { GridBudget } from '../../../@types/GridBudget';
import type { GridElement } from '../../../@types/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../../src/@types/math/Vec4';

/**
 * defaultGridSlice — the manual 200 Mpc origin-centred cube is the boot
 * view (an auto-fit-on-boot box would stretch to the catalog's outliers
 * until the local volume is a sliver of it). `manualVoxelSizeMpc: 0.75` is
 * a deliberate choice, denser than a divisor-1 default's implicit 0.78125
 * Mpc/vox: boot dims come out 272³ (decision record, Q4).
 */
export const defaultGridSlice: GridSlice = {
  manualVoxelSizeMpc: 0.75,
  paddingMpc: 5,
  manualCenterMpc: [0, 0, 0],
  manualSizeMpc: [200, 200, 200],
  manualRotation: [0, 0, 0, 1],
  importedBox: null,
  box: null,
  resolvedElement: null,
  byteBudget: null,
  showGridBox: true,
  maxBufferBytes: null,
};

export const gridSlice = createSlice({
  name: 'grid',
  initialState: defaultGridSlice,
  reducers: {
    // V3 ruling: every setter below a user reaches through the grid-controls UI
    // clears `importedBox` — a loaded preset's box wins until the user steers
    // the controls again, then the override has to die (setResolvedGrid, below,
    // is NOT one of these: it records a completed build, not a user edit).
    setVoxelSizeMpc: (state, action: PayloadAction<number>) => {
      state.manualVoxelSizeMpc = action.payload;
      state.importedBox = null;
    },
    setPaddingMpc: (state, action: PayloadAction<number>) => {
      state.paddingMpc = action.payload;
      state.importedBox = null;
    },
    setManualCenterMpc: (state, action: PayloadAction<Vec3>) => {
      state.manualCenterMpc = action.payload;
      state.importedBox = null;
    },
    setManualSizeMpc: (state, action: PayloadAction<Vec3>) => {
      state.manualSizeMpc = action.payload;
      state.importedBox = null;
    },
    /**
     * setRotation — F2.5's rotate-ring setter, same shape as its three siblings above
     * (manualCenterMpc/manualSizeMpc/…): a ring drag is "the user reaching through the
     * grid controls" exactly like a slider nudge, so it clears `importedBox` (V3) too.
     */
    setRotation: (state, action: PayloadAction<Readonly<Vec4>>) => {
      state.manualRotation = action.payload as Draft<Vec4>;
      state.importedBox = null;
    },
    /**
     * installImportedBox — the load-side setter: installs a preset's grid box verbatim AND
     * syncs the manual center/size/rotation/voxel-size fields to match, so the sliders (which
     * read those fields directly, not importedBox) show the loaded values, and a later
     * translate/resize/rotate drag — which clears importedBox onto the manual path — continues
     * from the imported orientation instead of snapping to identity. importedBox still wins in
     * deriveGridBox until that later edit clears it.
     */
    installImportedBox: (state, action: PayloadAction<GridBox>) => {
      const importedBox = action.payload;
      state.importedBox = importedBox as Draft<GridBox>;
      state.manualCenterMpc = importedBox.centerMpc;
      state.manualSizeMpc = importedBox.sizeMpc;
      state.manualRotation = importedBox.rotation as Draft<Vec4>;
      state.manualVoxelSizeMpc = importedBox.voxelSizeMpc;
    },
    /**
     * fitBoxToCatalog — "auto fit" as a one-shot ACTION, not a persistent mode:
     * snapshots `boundsMpc` into `manualCenterMpc`/`manualSizeMpc` once, and
     * from then on the box is an ordinary manual one (editable, survives a
     * catalog reload, etc — no boolean remembers how it got here). `paddingMpc`
     * bakes in at click time: it's an input to the NEXT fit, not a live modifier
     * of whatever box is already showing. A grid-control edit per the V3 ruling,
     * so it clears `importedBox` too.
     */
    fitBoxToCatalog: (state, action: PayloadAction<{ min: Vec3; max: Vec3 }>) => {
      const { min, max } = action.payload;
      state.manualCenterMpc = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      state.manualSizeMpc = [
        max[0] - min[0] + 2 * state.paddingMpc,
        max[1] - min[1] + 2 * state.paddingMpc,
        max[2] - min[2] + 2 * state.paddingMpc,
      ];
      state.importedBox = null;
    },
    /**
     * F1.7: persistent box-wireframe visibility, not a grid-control edit — unlike
     * every setter above, this does NOT clear `importedBox` (view state, no
     * bearing on which box is loaded).
     */
    setShowGridBox: (state, action: PayloadAction<boolean>) => {
      state.showGridBox = action.payload;
    },
    /** Records a completed fit: the resolved box, its element, and its byte budget. */
    setResolvedGrid: (
      state,
      action: PayloadAction<{ box: GridBox; resolvedElement: GridElement; byteBudget: GridBudget }>,
    ) => {
      state.box = action.payload.box as Draft<GridBox>;
      state.resolvedElement = action.payload.resolvedElement;
      state.byteBudget = action.payload.byteBudget;
    },
    /**
     * setMaxBufferBytes — V2's device-limit setter, same shape as `setResolvedGrid`
     * above: it records a fact about the hardware, not a user edit, so it does NOT
     * clear `importedBox`. Viewport calls it once, right after its first successful
     * GPU init, with `device.limits.maxStorageBufferBindingSize`.
     */
    setMaxBufferBytes: (state, action: PayloadAction<number>) => {
      state.maxBufferBytes = action.payload;
    },
  },
});

export const {
  setVoxelSizeMpc,
  setPaddingMpc,
  setManualCenterMpc,
  setManualSizeMpc,
  setRotation,
  installImportedBox,
  fitBoxToCatalog,
  setShowGridBox,
  setResolvedGrid,
  setMaxBufferBytes,
} = gridSlice.actions;
