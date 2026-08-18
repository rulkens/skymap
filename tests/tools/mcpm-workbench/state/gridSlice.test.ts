/**
 * gridSlice — every user-facing grid-control setter must clear `importedBox`
 * back to null (V3's ruling): a preset reloads to a bit-identical box only
 * until the user starts steering the grid controls again, at which point
 * the override has to die so deriveGridBox goes back to computing from
 * divisor/manual bounds. `fitBoxToCatalog` ("auto fit", S13.5) counts as one
 * of these edits too — it writes manualCenterMpc/manualSizeMpc directly,
 * same as a hand-dragged slider.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import {
  defaultGridSlice,
  fitBoxToCatalog,
  setDivisor,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
} from '../../../../tools/mcpm-workbench/src/state/slices/gridSlice';

const IMPORTED_BOX: GridBox = {
  centerMpc: [0, 0, 0],
  sizeMpc: [200, 200, 200],
  dims: [256, 256, 256],
  voxelSizeMpc: 0.78125,
};

const withImportedBox = { ...defaultGridSlice, importedBox: IMPORTED_BOX };

describe('gridSlice setters clear importedBox on any user edit', () => {
  it('setDivisor clears it', () => {
    expect(setDivisor(withImportedBox, 2).importedBox).toBeNull();
  });

  it('setPaddingMpc clears it', () => {
    expect(setPaddingMpc(withImportedBox, 10).importedBox).toBeNull();
  });

  it('setManualCenterMpc clears it', () => {
    expect(setManualCenterMpc(withImportedBox, [1, 2, 3]).importedBox).toBeNull();
  });

  it('setManualSizeMpc clears it', () => {
    expect(setManualSizeMpc(withImportedBox, [50, 50, 50]).importedBox).toBeNull();
  });

  it('fitBoxToCatalog clears it', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    expect(fitBoxToCatalog(withImportedBox, bounds).importedBox).toBeNull();
  });
});

describe('fitBoxToCatalog', () => {
  it('centers on the bounds midpoint and pads the extent by 2x paddingMpc per axis', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const next = fitBoxToCatalog({ ...defaultGridSlice, paddingMpc: 5 }, bounds);
    expect(next.manualCenterMpc).toEqual([50, 25, 15]);
    expect(next.manualSizeMpc).toEqual([110, 60, 40]);
  });

  it('bakes paddingMpc in at click time — a later paddingMpc change does not retroactively resize', () => {
    const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };
    const fitted = fitBoxToCatalog({ ...defaultGridSlice, paddingMpc: 5 }, bounds);
    const afterPaddingEdit = setPaddingMpc(fitted, 50);
    expect(afterPaddingEdit.manualSizeMpc).toEqual(fitted.manualSizeMpc);
  });
});
