/**
 * formatAxisSize — each size slider names its extent and voxel count together,
 * for the built box on every axis, cubic or not.
 */
import { describe, expect, it } from 'vitest';
import { deriveGridBox } from '../../../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { defaultGridSlice } from '../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { formatAxisSize } from '../../../../../../tools/mcpm-workbench/src/ui/GridBoxPanel/utils/formatAxisSize';

const AXES = [0, 1, 2] as const;

describe('formatAxisSize', () => {
  it('reads the default cube as 204 Mpc · 272 vox on every axis', () => {
    const box = deriveGridBox(defaultGridSlice);
    for (const axis of AXES) {
      expect(formatAxisSize(box.sizeMpc[axis], box.dims[axis])).toBe('204 Mpc · 272 vox');
    }
  });

  it('reads a non-cubic box per axis', () => {
    const box = deriveGridBox({ ...defaultGridSlice, manualSizeMpc: [198, 204, 150] });
    expect(AXES.map((axis) => formatAxisSize(box.sizeMpc[axis], box.dims[axis]))).toEqual([
      '198 Mpc · 264 vox',
      '204 Mpc · 272 vox',
      '150 Mpc · 200 vox',
    ]);
  });

  it('keeps the tenth a block off a whole Mpc carries, and strips float dust', () => {
    expect(formatAxisSize(31 * 6.4, 248)).toBe('198.4 Mpc · 248 vox');
    expect(formatAxisSize(0.1 + 0.2 + 199.7, 1000)).toBe('200 Mpc · 1000 vox');
  });
});
