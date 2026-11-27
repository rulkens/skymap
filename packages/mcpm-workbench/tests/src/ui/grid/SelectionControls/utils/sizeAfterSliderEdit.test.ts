/**
 * sizeAfterSliderEdit — a size-slider edit writes a block-aligned request, so
 * one step moves exactly one 8-voxel block both ways; the round-up in
 * autoFitGridBox must never swallow a step down. Near the device limit the
 * voxel floor moves with every edit, and sweeps must still come back exactly.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../../../../shared/src/@types/math/Vec3';
import type { GridSlice } from '../../../../../../@types/grid/GridSlice';
import { deriveGridBox } from '../../../../../../src/grid/deriveGridBox';
import {
  defaultGridSlice,
  gridSlice,
} from '../../../../../../src/state/grid/gridSlice';
import { sizeAfterSliderEdit } from '../../../../../../src/ui/grid/SelectionControls/utils/sizeAfterSliderEdit';
import { sizeSliderFor } from '../../../../../../src/ui/grid/SelectionControls/utils/sizeSliderFor';

const { actions, reducer } = gridSlice;
const AXES = [0, 1, 2] as const;
const SIZES: Vec3[] = [
  [200, 200, 200],
  [137, 61.3, 513],
];
const VOXEL_SIZES = [0.75, 0.1, 0.35, 1.3];

/** What the panel does on an arrow nudge: value ± step, then the slider edit. */
function nudge(grid: GridSlice, axis: 0 | 1 | 2, direction: 1 | -1): GridSlice {
  const slider = sizeSliderFor(deriveGridBox(grid), axis);
  const next = slider.value + direction * slider.step;
  return reducer(grid, actions.setManualSizeMpc(sizeAfterSliderEdit(grid, axis, next)));
}

function drag(grid: GridSlice, axis: 0 | 1 | 2, valueMpc: number): GridSlice {
  return reducer(grid, actions.setManualSizeMpc(sizeAfterSliderEdit(grid, axis, valueMpc)));
}

// Auto fit raises the voxel size off the floor, so the fixture lowers it back.
function fittedOn2GiB(halfMpc: Vec3): GridSlice {
  const fitted = reducer(
    reducer(defaultGridSlice, actions.setMaxBufferBytes(2 ** 31)),
    actions.fitBoxToCatalog({
      bounds: { min: [-halfMpc[0], -halfMpc[1], -halfMpc[2]], max: halfMpc },
      lanes: { agentCount: 0, pointCount: 0 },
    }),
  );
  return reducer(fitted, actions.setVoxelSizeMpc(defaultGridSlice.manualVoxelSizeMpc));
}

/** Auto fit around a 800 Mpc cube on a 2 GiB device: the voxel floor is active. */
const NEAR_LIMIT = fittedOn2GiB([400, 400, 400]);
/** The same, flattened in y, so y alone sets the floor until the slider first touches it. */
const NEAR_LIMIT_FLAT = fittedOn2GiB([400, 280, 400]);

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

  it('writes request equal to result: the edited axis derives the size it stores', () => {
    for (const grid of [defaultGridSlice, NEAR_LIMIT, NEAR_LIMIT_FLAT]) {
      const edited = nudge(nudge(grid, 1, 1), 1, 1);
      expect(deriveGridBox(edited).sizeMpc[1]).toBeCloseTo(edited.manualSizeMpc[1], 9);
    }
  });

  it('never goes below one block', () => {
    const box = deriveGridBox(defaultGridSlice);
    expect(sizeAfterSliderEdit(defaultGridSlice, 2, 0)[2]).toBe(8 * box.voxelSizeMpc);
  });

  it('near the device limit, 20 steps up and 20 back return the whole box, every axis', () => {
    const start = deriveGridBox(NEAR_LIMIT);
    expect(start.voxelSizeMpc).toBeGreaterThan(NEAR_LIMIT.manualVoxelSizeMpc);
    for (const axis of AXES) {
      let grid = NEAR_LIMIT;
      for (let i = 0; i < 20; i++) grid = nudge(grid, axis, 1);
      expect(deriveGridBox(grid).voxelSizeMpc).toBeGreaterThan(start.voxelSizeMpc);
      for (let i = 0; i < 20; i++) grid = nudge(grid, axis, -1);
      const back = deriveGridBox(grid);
      expect(back.dims).toEqual(start.dims);
      expect(back.voxelSizeMpc).toBeCloseTo(start.voxelSizeMpc, 12);
      for (const other of AXES) expect(back.sizeMpc[other]).toBeCloseTo(start.sizeMpc[other], 9);
    }
  });

  it('near the device limit, a box the slider has set comes back exactly from any sweep', () => {
    for (const axis of AXES) {
      let grid = nudge(nudge(NEAR_LIMIT_FLAT, axis, 1), axis, -1);
      const start = deriveGridBox(grid);
      for (let i = 0; i < 20; i++) grid = nudge(grid, axis, 1);
      for (let i = 0; i < 20; i++) grid = nudge(grid, axis, -1);
      const back = deriveGridBox(grid);
      expect(back.dims).toEqual(start.dims);
      expect(back.voxelSizeMpc).toBeCloseTo(start.voxelSizeMpc, 12);
    }
  });

  it('near the device limit, a drag out and back to the start value returns the whole box', () => {
    const start = deriveGridBox(NEAR_LIMIT);
    let grid = NEAR_LIMIT;
    for (let v = start.sizeMpc[0]; v <= start.sizeMpc[0] + 180; v += 7) grid = drag(grid, 0, v);
    for (let v = start.sizeMpc[0] + 180; v > start.sizeMpc[0]; v -= 7) grid = drag(grid, 0, v);
    const back = deriveGridBox(drag(grid, 0, start.sizeMpc[0]));
    expect(back.dims).toEqual(start.dims);
    expect(back.voxelSizeMpc).toBeCloseTo(start.voxelSizeMpc, 12);
  });

  it('near the device limit, every step moves the edited axis the way it was pressed', () => {
    let grid = NEAR_LIMIT;
    for (const direction of [1, -1] as const) {
      for (let i = 0; i < 20; i++) {
        const before = deriveGridBox(grid).sizeMpc[0];
        grid = nudge(grid, 0, direction);
        expect(Math.sign(deriveGridBox(grid).sizeMpc[0] - before)).toBe(direction);
      }
    }
  });

  it('leaves the requests of the axes it does not edit untouched', () => {
    const edited = nudge(nudge(NEAR_LIMIT, 0, 1), 0, 1);
    expect(edited.manualSizeMpc[1]).toBe(NEAR_LIMIT.manualSizeMpc[1]);
    expect(edited.manualSizeMpc[2]).toBe(NEAR_LIMIT.manualSizeMpc[2]);
  });
});
