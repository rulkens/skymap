/**
 * sizeAfterSliderEdit — a size-slider edit writes a block-aligned request, so
 * one step moves exactly one 8-voxel block both ways; the round-up in
 * autoFitGridBox must never swallow a step down.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { GridSlice } from '../../../../../../tools/mcpm-workbench/@types/GridSlice';
import { deriveGridBox } from '../../../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import {
  defaultGridSlice,
  gridSlice,
} from '../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { sizeAfterSliderEdit } from '../../../../../../tools/mcpm-workbench/src/ui/GridBoxPanel/utils/sizeAfterSliderEdit';
import { sizeSliderFor } from '../../../../../../tools/mcpm-workbench/src/ui/GridBoxPanel/utils/sizeSliderFor';

const { actions, reducer } = gridSlice;
const AXES = [0, 1, 2] as const;
const SIZES: Vec3[] = [
  [200, 200, 200],
  [137, 61.3, 513],
];
const VOXEL_SIZES = [0.75, 0.1, 0.35, 1.3];

/** What the panel does on an arrow nudge: value ± step, then the slider edit. */
function nudge(grid: GridSlice, axis: 0 | 1 | 2, direction: 1 | -1): GridSlice {
  const box = deriveGridBox(grid);
  const slider = sizeSliderFor(box, axis);
  const next = slider.value + direction * slider.step;
  return reducer(grid, actions.setManualSizeMpc(sizeAfterSliderEdit(box, axis, next)));
}

describe('sizeAfterSliderEdit', () => {
  it('a step down from the default 204 Mpc gives 198 Mpc (264 vox)', () => {
    const box = deriveGridBox(nudge(defaultGridSlice, 0, -1));
    expect(box.sizeMpc[0]).toBe(198);
    expect(box.dims[0]).toBe(264);
  });

  it('one step down then one step up returns to the starting box, on every axis', () => {
    for (const manualSizeMpc of SIZES) {
      for (const manualVoxelSizeMpc of VOXEL_SIZES) {
        const grid: GridSlice = {
          ...defaultGridSlice,
          manualCenterMpc: [12.3, -7.7, 0.45],
          manualSizeMpc,
          manualVoxelSizeMpc,
        };
        const start = deriveGridBox(grid);
        for (const axis of AXES) {
          const down = deriveGridBox(nudge(grid, axis, -1));
          expect(down.dims[axis]).toBe(start.dims[axis] - 8);
          const back = deriveGridBox(nudge(nudge(grid, axis, -1), axis, 1));
          expect(back.dims).toEqual(start.dims);
          expect(back.sizeMpc).toEqual(start.sizeMpc);
        }
      }
    }
  });

  it('writes request equal to result: the edited grid derives the size it stores', () => {
    const edited = nudge(defaultGridSlice, 1, 1);
    expect(deriveGridBox(edited).sizeMpc).toEqual(edited.manualSizeMpc);
  });

  it('never goes below one block', () => {
    const box = deriveGridBox(defaultGridSlice);
    expect(sizeAfterSliderEdit(box, 2, 0)[2]).toBe(8 * box.voxelSizeMpc);
  });
});
