/**
 * gridSlice — every user-facing grid-control setter must clear `importedBox`
 * back to null (V3's ruling): a preset reloads to a bit-identical box only
 * until the user starts steering the grid controls again, at which point
 * the override has to die so deriveGridBox goes back to computing from
 * voxel size/manual bounds. `fitBoxToCatalog` ("auto fit", S13.5) counts as one
 * of these edits too — it writes manualCenterMpc/manualSizeMpc directly,
 * same as a hand-dragged slider.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import {
  defaultGridSlice,
  gridSlice,
} from '../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

const { actions, reducer } = gridSlice;

// centerMpc/sizeMpc/rotation deliberately differ from defaultGridSlice's manual
// values on every axis — an installImportedBox test asserting sync against
// a fixture that coincides with the defaults can't distinguish "synced"
// from "left untouched" (see task-S17-review.md; rotation follows the same
// reasoning for F2.5's manualRotation sync).
const IMPORTED_BOX: GridBox = {
  centerMpc: [10, -5, 3],
  sizeMpc: [300, 300, 300],
  dims: [256, 256, 256],
  voxelSizeMpc: 1.171875,
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], // 90° about Y — non-identity
};

const withImportedBox = { ...defaultGridSlice, importedBox: IMPORTED_BOX };

describe('gridSlice setters clear importedBox on any user edit', () => {
  it('setVoxelSizeMpc clears it', () => {
    expect(reducer(withImportedBox, actions.setVoxelSizeMpc(2)).importedBox).toBeNull();
  });

  it('setPaddingMpc clears it', () => {
    expect(reducer(withImportedBox, actions.setPaddingMpc(10)).importedBox).toBeNull();
  });

  it('setManualCenterMpc clears it', () => {
    expect(reducer(withImportedBox, actions.setManualCenterMpc([1, 2, 3])).importedBox).toBeNull();
  });

  it('setManualSizeMpc clears it', () => {
    expect(reducer(withImportedBox, actions.setManualSizeMpc([50, 50, 50])).importedBox).toBeNull();
  });

  it('setRotation clears it', () => {
    const rotation: Vec4 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    expect(reducer(withImportedBox, actions.setRotation(rotation)).importedBox).toBeNull();
  });

  it('fitBoxToCatalog clears it', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    expect(reducer(withImportedBox, actions.fitBoxToCatalog(bounds)).importedBox).toBeNull();
  });

  it('setAutoFitPercent clears it', () => {
    expect(reducer(withImportedBox, actions.setAutoFitPercent(90)).importedBox).toBeNull();
  });
});

describe('setAutoFitPercent', () => {
  it('clamps below 80 up to 80', () => {
    expect(reducer(defaultGridSlice, actions.setAutoFitPercent(50)).autoFitPercent).toBe(80);
  });

  it('clamps above 100 down to 100', () => {
    expect(reducer(defaultGridSlice, actions.setAutoFitPercent(150)).autoFitPercent).toBe(100);
  });

  it('passes an in-range integer through unchanged', () => {
    expect(reducer(defaultGridSlice, actions.setAutoFitPercent(92)).autoFitPercent).toBe(92);
  });
});

describe('installImportedBox', () => {
  it('syncs manualCenterMpc/manualSizeMpc/manualRotation/manualVoxelSizeMpc to the imported box while installing it (S17, F2.5, V1)', () => {
    const next = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    expect(next.importedBox).toEqual(IMPORTED_BOX);
    expect(next.manualCenterMpc).toEqual(IMPORTED_BOX.centerMpc);
    expect(next.manualSizeMpc).toEqual(IMPORTED_BOX.sizeMpc);
    expect(next.manualRotation).toEqual(IMPORTED_BOX.rotation);
    expect(next.manualVoxelSizeMpc).toEqual(IMPORTED_BOX.voxelSizeMpc);
  });

  it('a subsequent setManualSizeMpc still clears importedBox (V3 ruling stays green)', () => {
    const loaded = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    expect(reducer(loaded, actions.setManualSizeMpc([50, 50, 50])).importedBox).toBeNull();
  });

  it('a subsequent resize/translate drag on a loaded rotated box keeps its rotation (no snap to identity)', () => {
    // F2.5 regression: manualRotation must be synced at install time, not left at the
    // default identity — otherwise clearing importedBox (any manual edit, V3) would fall
    // onto deriveGridBox's manual path and silently reset a loaded box's orientation.
    const loaded = reducer(defaultGridSlice, actions.installImportedBox(IMPORTED_BOX));
    const afterDrag = reducer(loaded, actions.setManualCenterMpc([20, 20, 20]));
    expect(afterDrag.importedBox).toBeNull();
    expect(afterDrag.manualRotation).toEqual(IMPORTED_BOX.rotation);
  });
});

describe('setMaxBufferBytes', () => {
  it('records the device limit without clearing importedBox — a hardware fact, not a user edit', () => {
    const next = reducer(withImportedBox, actions.setMaxBufferBytes(4 * 1024 ** 3));
    expect(next.maxBufferBytes).toBe(4 * 1024 ** 3);
    expect(next.importedBox).toEqual(IMPORTED_BOX);
  });
});

describe('fitBoxToCatalog', () => {
  it('centers on the bounds midpoint and pads the extent by 2x paddingMpc per axis', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const next = reducer({ ...defaultGridSlice, paddingMpc: 5 }, actions.fitBoxToCatalog(bounds));
    expect(next.manualCenterMpc).toEqual([50, 25, 15]);
    expect(next.manualSizeMpc).toEqual([110, 60, 40]);
  });

  it('bakes paddingMpc in at click time — a later paddingMpc change does not retroactively resize', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const fitted = reducer({ ...defaultGridSlice, paddingMpc: 5 }, actions.fitBoxToCatalog(bounds));
    const afterPaddingEdit = reducer(fitted, actions.setPaddingMpc(50));
    expect(afterPaddingEdit.manualSizeMpc).toEqual(fitted.manualSizeMpc);
  });
});
