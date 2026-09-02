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
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

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

  it('V2: importedBox stays verbatim (unclamped) even past a set maxBufferBytes floor', () => {
    // A box that would itself blow a tiny limit if it were derived through the manual
    // path — importedBox must return it untouched anyway (ruling in deriveGridBox.ts).
    const importedBox = {
      centerMpc: [0, 0, 0] as Vec3,
      sizeMpc: [800, 800, 800] as Vec3,
      dims: [1600, 1600, 1600] as Vec3,
      voxelSizeMpc: 0.5,
      rotation: [0, 0, 0, 1] as Vec4,
    };
    const box = deriveGridBox({ ...defaultGridSlice, importedBox, maxBufferBytes: 2048 });
    expect(box).toEqual(importedBox);
  });
});

describe('deriveGridBox — V2 allocation-aware voxel-size floor', () => {
  it('maxBufferBytes null: manual voxel size passes through unclamped', () => {
    const grid = {
      ...defaultGridSlice,
      manualSizeMpc: [1500, 1500, 1500] as Vec3,
      manualVoxelSizeMpc: 0.1, // would need ~15000^3 voxels — refused on any real device
      maxBufferBytes: null,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBe(0.1);
  });

  it('manual voxel size above the floor: derived voxelSizeMpc is unchanged', () => {
    const grid = {
      ...defaultGridSlice,
      manualSizeMpc: [200, 200, 200] as Vec3,
      manualVoxelSizeMpc: 1, // dims 200^3 * 4 bytes = 32 MB, well under the limit below
      resolvedElement: 'f32' as const,
      maxBufferBytes: 4 * 1024 ** 3,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBe(1);
  });

  it('manual voxel size below the floor: derived voxelSizeMpc is clamped up to the floor', () => {
    // Same fixture minFeasibleVoxelSizeMpc.test.ts hand-computes: 1500 Mpc extent, f32,
    // a 4 GiB limit floors at exactly 1500/1024 Mpc/vox (dims 1024^3 * 4 = 4 GiB exactly).
    const grid = {
      ...defaultGridSlice,
      manualSizeMpc: [1500, 1500, 1500] as Vec3,
      manualVoxelSizeMpc: 0.1,
      resolvedElement: 'f32' as const,
      maxBufferBytes: 4 * 1024 ** 3,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBeCloseTo(1500 / 1024, 9);
    expect(box.dims).toEqual([1024, 1024, 1024]);
  });

  it('resolvedElement null before a first build: floor computed at f32 (4 bytes), not f16', () => {
    const grid = {
      ...defaultGridSlice,
      manualSizeMpc: [1500, 1500, 1500] as Vec3,
      manualVoxelSizeMpc: 0.1,
      resolvedElement: null,
      maxBufferBytes: 4 * 1024 ** 3,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBeCloseTo(1500 / 1024, 9);
  });

  it('fix round 1: an infeasible (Infinity) floor is treated as no usable floor, not an infinite voxel size', () => {
    // maxBufferBytes below the 8-voxel-per-axis minimum (2048 bytes at f32) — no voxel
    // size fits any extent, so minFeasibleVoxelSizeMpc returns Infinity; the clamp must
    // fail OPEN here (manual value passes through) rather than poisoning the box.
    const grid = {
      ...defaultGridSlice,
      manualSizeMpc: [500, 500, 500] as Vec3,
      manualVoxelSizeMpc: 0.75,
      resolvedElement: 'f32' as const,
      maxBufferBytes: 2047,
    };
    const box = deriveGridBox(grid);
    expect(box.voxelSizeMpc).toBe(0.75);
    expect(Number.isFinite(box.dims[0])).toBe(true);
  });
});
