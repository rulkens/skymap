/**
 * gridSlice — every user-facing grid-control setter must clear `importedBox`
 * back to null (V3's ruling): a preset reloads to a bit-identical box only
 * until the user starts steering the grid controls again, at which point
 * the override has to die so deriveGridBox goes back to computing from
 * autoFit/divisor/manual bounds.
 */
import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import {
  defaultGridSlice,
  setAutoFit,
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
  it('setAutoFit clears it', () => {
    expect(setAutoFit(withImportedBox, true).importedBox).toBeNull();
  });

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
});
