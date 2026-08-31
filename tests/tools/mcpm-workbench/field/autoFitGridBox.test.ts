/**
 * autoFitGridBox — the cubic-voxel invariant buildRhizomeVolume's 0.5% spread
 * assert depends on. `voxelSizeMpc` is an INPUT since V1 (grid-voxel-size-
 * currency decision record) — every expected value below is hand-computed,
 * not pinned from a run: ceil8 of each axis's raw extent/voxelSizeMpc is
 * checkable on paper.
 */
import { describe, expect, it } from 'vitest';
import { autoFitGridBox } from '../../../../tools/mcpm-workbench/src/field/autoFitGridBox';

describe('autoFitGridBox', () => {
  it('gives every axis a multiple-of-8 dimension for an asymmetric bbox', () => {
    const box = autoFitGridBox({ min: [0, 0, 0], max: [100, 50, 30] }, 1.5625, 0);
    // dims = ceil8(extent/voxelSizeMpc): x ceil8(64)=64, y ceil8(32)=32, z ceil8(19.2)=24.
    expect(box.dims).toEqual([64, 32, 24]);
    for (const d of box.dims) expect(d % 8).toBe(0);
  });

  it('keeps the voxel size identical on all three axes', () => {
    const box = autoFitGridBox({ min: [0, 0, 0], max: [100, 50, 30] }, 1.5625, 0);
    const perAxis = box.sizeMpc.map((s, i) => s / box.dims[i]!);
    expect(perAxis[1]).toBe(perAxis[0]);
    expect(perAxis[2]).toBe(perAxis[0]);
  });

  it('grows the box so sizeMpc equals dims x voxelSize, and returns the requested voxelSizeMpc exactly', () => {
    const box = autoFitGridBox({ min: [0, 0, 0], max: [100, 50, 30] }, 1.5625, 0);
    expect(box.voxelSizeMpc).toBe(1.5625);
    expect(box.dims).toEqual([64, 32, 24]);
    expect(box.sizeMpc).toEqual([100, 50, 37.5]);
    expect(box.sizeMpc).toEqual([
      box.dims[0] * box.voxelSizeMpc,
      box.dims[1] * box.voxelSizeMpc,
      box.dims[2] * box.voxelSizeMpc,
    ]);
  });

  it('the manual override at a given voxel size still yields cubic voxels', () => {
    // Hand-picked centre/size/voxel-size triple: a UI override derives bounds
    // from center+size and calls autoFitGridBox — same construction path.
    const center = [10, -5, 20] as const;
    const size = [40, 24, 16] as const;
    const voxelSizeMpc = 1.25;
    const box = autoFitGridBox(
      {
        min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
        max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
      },
      voxelSizeMpc,
      0,
    );
    // dims: x ceil8(32)=32, y ceil8(19.2)=24, z ceil8(12.8)=16.
    expect(box.voxelSizeMpc).toBe(1.25);
    expect(box.dims).toEqual([32, 24, 16]);
    expect(box.sizeMpc).toEqual([40, 30, 20]);
    const perAxis = box.sizeMpc.map((s, i) => s / box.dims[i]!);
    expect(perAxis[1]).toBe(perAxis[0]);
    expect(perAxis[2]).toBe(perAxis[0]);
  });

  it('keeps at least paddingMpc of margin on every axis, not just the longest', () => {
    // Non-cubic bounds so the short axes are the ones at risk: sizing every
    // axis's dims from its RAW extent (instead of the padded one) could leave
    // data on a short axis within ceil8 slack of the box face.
    const padding = 5;
    const box = autoFitGridBox({ min: [0, 0, 0], max: [100, 50, 30] }, 1.5625, padding);
    for (let i = 0; i < 3; i++) {
      const extent = [100, 50, 30][i]!;
      const margin = (box.sizeMpc[i]! - extent) / 2;
      expect(margin).toBeGreaterThanOrEqual(padding);
    }
    const perAxis = box.sizeMpc.map((s, i) => s / box.dims[i]!);
    expect(perAxis[1]).toBe(perAxis[0]);
    expect(perAxis[2]).toBe(perAxis[0]);
    for (const d of box.dims) expect(d % 8).toBe(0);
  });
});
