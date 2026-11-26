/**
 * sizeSliderFor — the size sliders show the box the sim builds (deriveGridBox),
 * never the stored request, so their value is always dims × voxelSizeMpc.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../../../../src/@types/math/Vec4';
import type { GridSlice } from '../../../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import { deriveGridBox } from '../../../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { defaultGridSlice } from '../../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { sizeAfterSliderEdit } from '../../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/sizeAfterSliderEdit';
import { sizeSliderFor } from '../../../../../../../tools/mcpm-workbench/src/ui/grid/SelectionControls/utils/sizeSliderFor';

const AXES = [0, 1, 2] as const;
const SIZES: Vec3[] = [
  [200, 200, 200],
  [137, 61.3, 513],
];
const VOXEL_SIZES = [0.75, 0.1, 0.35, 1.3];

function gridsUnderTest(): GridSlice[] {
  const grids: GridSlice[] = [defaultGridSlice];
  for (const manualSizeMpc of SIZES) {
    for (const manualVoxelSizeMpc of VOXEL_SIZES) {
      grids.push({
        ...defaultGridSlice,
        manualCenterMpc: [12.3, -7.7, 0.45],
        manualSizeMpc,
        manualVoxelSizeMpc,
      });
    }
  }
  return grids;
}

describe('sizeSliderFor', () => {
  it('shows dims × voxelSizeMpc of the derived box and steps one 8-voxel block', () => {
    for (const grid of gridsUnderTest()) {
      const box = deriveGridBox(grid);
      for (const axis of AXES) {
        const slider = sizeSliderFor(box, axis);
        expect(slider.value).toBe(box.dims[axis] * box.voxelSizeMpc);
        expect(slider.step).toBe(8 * box.voxelSizeMpc);
        expect(slider.min).toBe(slider.step);
      }
    }
  });

  it('shows the default box as built: 272 vox at 0.75 Mpc/vox is 204 Mpc', () => {
    const box = deriveGridBox(defaultGridSlice);
    expect(box.dims).toEqual([272, 272, 272]);
    for (const axis of AXES) expect(sizeSliderFor(box, axis).value).toBe(204);
  });

  it('keeps its value inside its range, on the step lattice, for boxes wider than the usual top end', () => {
    // On a 64 MiB device, End on size x lands past the top end: the voxel floor coarsens the box.
    const small: GridSlice = { ...defaultGridSlice, maxBufferBytes: 64 * 1024 ** 2 };
    const atEnd: GridSlice = {
      ...small,
      manualSizeMpc: sizeAfterSliderEdit(small, 0, sizeSliderFor(deriveGridBox(small), 0).max),
    };
    const wide: GridSlice[] = [{ ...defaultGridSlice, manualSizeMpc: [1500, 1200, 300] }, atEnd];
    for (const grid of wide) {
      const box = deriveGridBox(grid);
      for (const axis of AXES) {
        const slider = sizeSliderFor(box, axis);
        expect(slider.max).toBeGreaterThanOrEqual(slider.value);
        const blocks = (slider.max - slider.min) / slider.step;
        expect(blocks).toBeCloseTo(Math.round(blocks), 9);
      }
    }
    expect(sizeSliderFor(deriveGridBox(wide[0]!), 0).max).toBeCloseTo(1500, 9);
  });

  it('shows an imported box at its own size, off the 8-voxel lattice', () => {
    const importedBox = {
      centerMpc: [0, 0, 0] as Vec3,
      sizeMpc: [203.5, 101, 50.2] as Vec3,
      dims: [272, 136, 64] as Vec3,
      voxelSizeMpc: 0.75,
      rotation: [0, 0, 0, 1] as Vec4,
    };
    const box = deriveGridBox({ ...defaultGridSlice, importedBox });
    for (const axis of AXES) expect(sizeSliderFor(box, axis).value).toBe(importedBox.sizeMpc[axis]);
  });
});
