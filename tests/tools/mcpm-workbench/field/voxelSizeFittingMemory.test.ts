/**
 * voxelSizeFittingMemory — the smallest voxel size on the slider's lattice that
 * keeps the GPU bar (one grid buffer against the device limit) below its warn zone.
 */
import { describe, expect, it } from 'vitest';
import type { GridSlice } from '../../../../tools/mcpm-workbench/@types/GridSlice';
import { deriveGridBox } from '../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { VOXEL_SIZE_STEP_LOG10 } from '../../../../tools/mcpm-workbench/src/field/VOXEL_SIZE_STEP_LOG10';
import { voxelSizeFittingMemory } from '../../../../tools/mcpm-workbench/src/field/voxelSizeFittingMemory';
import { GPU_BUFFER_ZONE_FROM } from '../../../../tools/mcpm-workbench/src/sim/GPU_BUFFER_ZONE_FROM';
import { estimateBoxGridBufferBytes } from '../../../../tools/mcpm-workbench/src/sim/estimateBoxGridBufferBytes';
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

const GIB = 1024 ** 3;

const barFraction = (grid: GridSlice) => estimateBoxGridBufferBytes(grid) / grid.maxBufferBytes!;

describe('voxelSizeFittingMemory', () => {
  it('keeps a voxel size that already fits, and any voxel size before the device limit is known', () => {
    const small: GridSlice = { ...defaultGridSlice, maxBufferBytes: 2 * GIB };
    expect(voxelSizeFittingMemory(small)).toBe(small.manualVoxelSizeMpc);
    const unknown: GridSlice = { ...defaultGridSlice, manualSizeMpc: [16_000, 16_000, 16_000] };
    expect(voxelSizeFittingMemory(unknown)).toBe(unknown.manualVoxelSizeMpc);
  });

  it('raises to the smallest lattice step below the warn zone, for cubes and flat boxes', () => {
    const boxes: GridSlice['manualSizeMpc'][] = [
      [16_010, 16_010, 16_010],
      [16_000, 16_000, 10],
      [3_000, 500, 40],
    ];
    for (const manualSizeMpc of boxes) {
      for (const [maxBufferBytes, resolvedElement] of [
        [2 * GIB, 'f16'],
        [4 * GIB, 'f32'],
        [64 * 1024 ** 2, 'f32'],
      ] as const) {
        const grid: GridSlice = {
          ...defaultGridSlice,
          manualSizeMpc,
          maxBufferBytes,
          resolvedElement,
        };
        const raisedMpc = voxelSizeFittingMemory(grid);
        const raised = { ...grid, manualVoxelSizeMpc: raisedMpc };
        expect(barFraction(raised)).toBeLessThan(GPU_BUFFER_ZONE_FROM.warn);
        if (raisedMpc === grid.manualVoxelSizeMpc) continue;
        const steps = Math.log10(raisedMpc) / VOXEL_SIZE_STEP_LOG10;
        expect(steps).toBeCloseTo(Math.round(steps), 9);
        const oneStepFiner = 10 ** (Math.log10(raisedMpc) - VOXEL_SIZE_STEP_LOG10);
        if (oneStepFiner > grid.manualVoxelSizeMpc) {
          const finer = { ...grid, manualVoxelSizeMpc: oneStepFiner };
          expect(barFraction(finer)).toBeGreaterThanOrEqual(GPU_BUFFER_ZONE_FROM.warn);
        }
        expect(deriveGridBox(raised).voxelSizeMpc).toBe(raisedMpc);
      }
    }
  });
});
