/**
 * voxelSizeSliderFor — the voxel-size slider travels in log10 Mpc, and its top
 * end grows with the box so a large box can always be coarsened to a small grid.
 */
import { describe, expect, it } from 'vitest';
import type { GridSlice } from '../../../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import { deriveGridBox } from '../../../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { voxelSizeFloorMpc } from '../../../../../../../tools/mcpm-workbench/src/grid/voxelSize/voxelSizeFloorMpc';
import { defaultGridSlice } from '../../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { voxelSizeSliderFor } from '../../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/voxelSizeSliderFor';

const GIB = 1024 ** 3;

describe('voxelSizeSliderFor', () => {
  it('keeps the usual 0.25 to 4 Mpc range for the default box', () => {
    const slider = voxelSizeSliderFor(defaultGridSlice);
    expect(10 ** slider.min).toBeCloseTo(0.25, 9);
    expect(10 ** slider.max).toBeCloseTo(4, 9);
    expect(10 ** slider.value).toBeCloseTo(0.75, 9);
  });

  it('reaches a 64-voxel long axis for a 16,000 Mpc box', () => {
    const grid: GridSlice = { ...defaultGridSlice, manualSizeMpc: [16_000, 9_000, 4_000] };
    expect(10 ** voxelSizeSliderFor(grid).max).toBeCloseTo(250, 6);
    const coarsest = deriveGridBox({ ...grid, manualVoxelSizeMpc: 250 });
    expect(coarsest.dims).toEqual([64, 40, 16]);
  });

  it('never tops out below the device floor, and holds its value when the floor is above 4 Mpc', () => {
    const grid: GridSlice = {
      ...defaultGridSlice,
      manualSizeMpc: [16_000, 16_000, 16_000],
      maxBufferBytes: 4 * GIB,
    };
    const floorMpc = voxelSizeFloorMpc(grid)!;
    expect(floorMpc).toBeGreaterThan(4);
    const slider = voxelSizeSliderFor(grid);
    expect(10 ** slider.max).toBeGreaterThanOrEqual(floorMpc);
    expect(10 ** slider.min).toBeCloseTo(floorMpc, 9);
    expect(10 ** slider.value).toBeCloseTo(floorMpc, 9);
  });

  it('holds its value inside its range for imported and off-range boxes', () => {
    const imported = deriveGridBox({ ...defaultGridSlice, manualVoxelSizeMpc: 0.1 });
    const grids: GridSlice[] = [
      defaultGridSlice,
      { ...defaultGridSlice, manualVoxelSizeMpc: 0.1 },
      { ...defaultGridSlice, manualVoxelSizeMpc: 40 },
      { ...defaultGridSlice, importedBox: imported, manualVoxelSizeMpc: 0.1 },
      { ...defaultGridSlice, manualSizeMpc: [16_000, 300, 300], maxBufferBytes: 64 * 1024 ** 2 },
    ];
    for (const grid of grids) {
      const slider = voxelSizeSliderFor(grid);
      expect(slider.min).toBeLessThanOrEqual(slider.value);
      expect(slider.value).toBeLessThanOrEqual(slider.max);
      expect(10 ** slider.value).toBeCloseTo(deriveGridBox(grid).voxelSizeMpc, 9);
    }
  });
});
