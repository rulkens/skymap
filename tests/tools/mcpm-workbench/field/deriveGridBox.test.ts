/**
 * deriveGridBox — the ONE box-derivation Viewport's build and GridBoxPanel's
 * dims readout must never disagree on. Derivation is always the manual path
 * (S13.5: "auto fit" is a one-shot action that writes manualCenterMpc/
 * manualSizeMpc, not a persistent mode this function branches on) — covers
 * manual center+size and manualVoxelSizeMpc, stored directly (V1: grid-voxel-
 * size-currency decision record).
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { deriveGridBox } from '../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/slices/gridSlice';

describe('deriveGridBox', () => {
  it('derives from manualCenterMpc/manualSizeMpc at the panel manualVoxelSizeMpc', () => {
    const manualCenterMpc: Vec3 = [10, -5, 20];
    const manualSizeMpc: Vec3 = [40, 24, 16];
    const grid = {
      ...defaultGridSlice,
      // Same fixture as autoFitGridBox's manual-override test.
      manualVoxelSizeMpc: 1.25,
      manualCenterMpc,
      manualSizeMpc,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBe(1.25);
    expect(box.dims).toEqual([32, 24, 16]);
    expect(box.sizeMpc).toEqual([40, 30, 20]);
  });

  it('boot default: 200 Mpc box at 0.75 Mpc/vox — dims 272³, voxelSizeMpc exact (Q4)', () => {
    const box = deriveGridBox(defaultGridSlice);
    expect(box.dims).toEqual([272, 272, 272]);
    expect(box.voxelSizeMpc).toBe(0.75);
  });

  it('derives rotation from grid.manualRotation — autoFitGridBox itself always returns identity', () => {
    const manualRotation: Vec4 = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° about Y
    const box = deriveGridBox({ ...defaultGridSlice, manualRotation });
    expect(box.rotation).toEqual(manualRotation);
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
