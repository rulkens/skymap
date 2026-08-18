/**
 * deriveGridBox — the ONE box-derivation Viewport's build and GridBoxPanel's
 * dims readout must never disagree on. Derivation is always the manual path
 * (S13.5: "auto fit" is a one-shot action that writes manualCenterMpc/
 * manualSizeMpc, not a persistent mode this function branches on) — covers
 * manual center+size and the divisor scaling the long axis.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { deriveGridBox } from '../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/slices/gridSlice';

describe('deriveGridBox', () => {
  it('derives from manualCenterMpc/manualSizeMpc at the panel divisor', () => {
    const manualCenterMpc: Vec3 = [10, -5, 20];
    const manualSizeMpc: Vec3 = [40, 24, 16];
    const grid = {
      ...defaultGridSlice,
      // Same fixture as autoFitGridBox's manual-override test, resolution=32:
      // 256/8 = 32.
      divisor: 8,
      manualCenterMpc,
      manualSizeMpc,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBe(1.25);
    expect(box.dims).toEqual([32, 24, 16]);
    expect(box.sizeMpc).toEqual([40, 30, 20]);
  });

  it('a smaller divisor yields a longer (finer) long axis, a bigger one a shorter (coarser) one', () => {
    const fine = deriveGridBox({ ...defaultGridSlice, divisor: 0.75 });
    const coarse = deriveGridBox({ ...defaultGridSlice, divisor: 3 });
    const longAxis = (b: typeof fine): number => Math.max(...b.dims);
    expect(longAxis(fine)).toBeGreaterThan(longAxis(coarse));
  });

  it('grid.importedBox short-circuits derivation, returned verbatim', () => {
    const importedBox = {
      centerMpc: [1, 2, 3] as Vec3,
      sizeMpc: [80, 80, 80] as Vec3,
      dims: [40, 40, 40] as Vec3,
      voxelSizeMpc: 2,
      rotation: [0, 0, 0, 1] as Vec4,
    };
    const box = deriveGridBox({ ...defaultGridSlice, importedBox });
    expect(box).toEqual(importedBox);
  });
});
