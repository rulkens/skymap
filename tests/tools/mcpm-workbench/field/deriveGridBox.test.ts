/**
 * deriveGridBox — the ONE box-derivation Viewport's build and GridBoxPanel's
 * dims readout must never disagree on. Covers: auto-fit needs cached catalog
 * bounds (null without them), manual mode ignores those bounds and padding,
 * and the divisor scales the long axis via BASE_LONG_AXIS/divisor.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { deriveGridBox } from '../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/slices/gridSlice';

const bounds: { min: Vec3; max: Vec3 } = { min: [0, 0, 0], max: [100, 50, 30] };

describe('deriveGridBox', () => {
  it('auto-fit derives from the cached catalog bounds, honouring padding', () => {
    const grid = { ...defaultGridSlice, autoFit: true, divisor: 4, paddingMpc: 0 };
    // divisor 4 -> longAxis = round(256/4) = 64, matching autoFitGridBox's own
    // hand-computed fixture (voxelSizeMpc = 100/64 = 1.5625, dims [64, 32, 24]).
    const box = deriveGridBox(grid, bounds);
    expect(box).not.toBeNull();
    expect(box!.voxelSizeMpc).toBe(1.5625);
    expect(box!.dims).toEqual([64, 32, 24]);
  });

  it('auto-fit with no catalog loaded yet returns null — nothing to fit around', () => {
    const grid = { ...defaultGridSlice, autoFit: true };
    expect(deriveGridBox(grid, null)).toBeNull();
  });

  it('manual mode ignores catalog bounds and padding, using center+size instead', () => {
    const manualCenterMpc: Vec3 = [10, -5, 20];
    const manualSizeMpc: Vec3 = [40, 24, 16];
    const grid = {
      ...defaultGridSlice,
      autoFit: false,
      // Same fixture as autoFitGridBox's manual-override test, resolution=32:
      // 256/8 = 32.
      divisor: 8,
      paddingMpc: 999, // must be ignored — manual mode's own padding is always 0
      manualCenterMpc,
      manualSizeMpc,
    };
    const box = deriveGridBox(grid, null);
    expect(box).not.toBeNull();
    expect(box!.voxelSizeMpc).toBe(1.25);
    expect(box!.dims).toEqual([32, 24, 16]);
    expect(box!.sizeMpc).toEqual([40, 30, 20]);
  });

  it('a smaller divisor yields a longer (finer) long axis, a bigger one a shorter (coarser) one', () => {
    const fine = deriveGridBox({ ...defaultGridSlice, autoFit: true, divisor: 0.75 }, bounds);
    const coarse = deriveGridBox({ ...defaultGridSlice, autoFit: true, divisor: 3 }, bounds);
    const longAxis = (b: NonNullable<typeof fine>): number => Math.max(...b.dims);
    expect(longAxis(fine!)).toBeGreaterThan(longAxis(coarse!));
  });
});
