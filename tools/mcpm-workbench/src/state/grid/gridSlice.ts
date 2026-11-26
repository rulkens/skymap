import { createSlice, current, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import { voxelSizeFittingMemory } from '../../grid/voxelSize/voxelSizeFittingMemory';
import type { AutoFitRequest } from '../../../@types/grid/AutoFitRequest';
import type { GridSlice } from '../../../@types/grid/GridSlice';
import type { GridBox } from '../../../@types/grid/GridBox';
import type { GridElement } from '../../../@types/grid/GridElement';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../../src/@types/math/Vec4';

/**
 * defaultGridSlice — a manual origin-centred cube is the boot view (an
 * auto-fit-on-boot box would stretch to the catalog's outliers until the
 * local volume is a sliver of it). `manualSizeMpc` is a request: 200 Mpc rounds
 * up to 272³ voxels, a 204 Mpc box, which is what the panel shows. It stays
 * 200 because `?probe` coarsens this same request to 64³ at 3.125 Mpc/vox
 * (defaultAppState.ts), the grid its energy band was measured on.
 */
export const defaultGridSlice: GridSlice = {
  manualVoxelSizeMpc: 0.75,
  paddingMpc: 5,
  manualCenterMpc: [0, 0, 0],
  manualSizeMpc: [200, 200, 200],
  manualRotation: [0, 0, 0, 1],
  importedBox: null,
  resolvedElement: null,
  maxBufferBytes: null,
  autoFitPercent: 97,
};

export const gridSlice = createSlice({
  name: 'grid',
  initialState: defaultGridSlice,
  reducers: {
    // Every setter a user reaches through the grid controls clears `importedBox`:
    // a loaded preset's box wins until the user steers the controls again.
    // setResolvedGrid and setMaxBufferBytes record facts, not edits, and keep it.
    setVoxelSizeMpc: (state, action: PayloadAction<number>) => {
      state.manualVoxelSizeMpc = action.payload;
      state.importedBox = null;
    },
    // Refused, not clamped: the field passes NaN while it is empty or mid-edit.
    setPaddingMpc: (state, action: PayloadAction<number>) => {
      if (!(Number.isFinite(action.payload) && action.payload >= 0)) return;
      state.paddingMpc = action.payload;
      state.importedBox = null;
    },
    // Clamped here, not just at the slider: `denseFractionBounds` assumes the 80% floor.
    setAutoFitPercent: (state, action: PayloadAction<number>) => {
      state.autoFitPercent = Math.min(100, Math.max(80, Math.round(action.payload)));
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
    setRotation: (state, action: PayloadAction<Readonly<Vec4>>) => {
      state.manualRotation = action.payload as Draft<Vec4>;
      state.importedBox = null;
    },
    /** Installs a preset's box verbatim AND syncs the manual fields to it, so the sliders
     *  show the loaded values and a later drag continues from the imported orientation. */
    installImportedBox: (state, action: PayloadAction<GridBox>) => {
      const importedBox = action.payload;
      state.importedBox = importedBox as Draft<GridBox>;
      state.manualCenterMpc = importedBox.centerMpc;
      state.manualSizeMpc = importedBox.sizeMpc;
      state.manualRotation = importedBox.rotation as Draft<Vec4>;
      state.manualVoxelSizeMpc = importedBox.voxelSizeMpc;
    },
    /**
     * fitBoxToCatalog — Auto fit as a one-shot ACTION: snapshots the bounds into the
     * manual center and size once; from then on the box is an ordinary manual one.
     * The voxel size is kept unless the fitted sim would put the GPU bar in its warn
     * zone; then it is raised until it does not. The panel's and the load dialog's
     * Auto fit both run through here, so the dialog's preview (fittedGrid) matches.
     */
    fitBoxToCatalog: (state, action: PayloadAction<AutoFitRequest>) => {
      const { min, max } = action.payload.bounds;
      state.manualCenterMpc = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      state.manualSizeMpc = [
        max[0] - min[0] + 2 * state.paddingMpc,
        max[1] - min[1] + 2 * state.paddingMpc,
        max[2] - min[2] + 2 * state.paddingMpc,
      ];
      state.importedBox = null;
      state.manualVoxelSizeMpc = voxelSizeFittingMemory(current(state), action.payload.lanes);
    },
    /** Records a completed build's element. */
    setResolvedGrid: (state, action: PayloadAction<{ resolvedElement: GridElement }>) => {
      state.resolvedElement = action.payload.resolvedElement;
    },
    /** After each build, with `bufferLimitBytes(device.limits)`, the limit planGridBudget refuses against. */
    setMaxBufferBytes: (state, action: PayloadAction<number>) => {
      state.maxBufferBytes = action.payload;
    },
  },
});

export const {
  setVoxelSizeMpc,
  setPaddingMpc,
  setAutoFitPercent,
  setManualCenterMpc,
  setManualSizeMpc,
  setRotation,
  installImportedBox,
  fitBoxToCatalog,
  setResolvedGrid,
  setMaxBufferBytes,
} = gridSlice.actions;
