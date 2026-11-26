/**
 * voxelSizeFittingMemory — the smallest voxel size on the slider's lattice that
 * keeps the GPU bar (the sim's total memory against the device's buffer limit)
 * below its warn zone.
 */
import { describe, expect, it } from 'vitest';
import type { GridSlice } from '../../../../../tools/mcpm-workbench/@types/grid/GridSlice';
import type { SimLaneCounts } from '../../../../../tools/mcpm-workbench/@types/sim/SimLaneCounts';
import { deriveGridBox } from '../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { VOXEL_SIZE_STEP_LOG10 } from '../../../../../tools/mcpm-workbench/src/grid/voxelSize/voxelSizeStepLog10.constant';
import { voxelSizeFittingMemory } from '../../../../../tools/mcpm-workbench/src/grid/voxelSize/voxelSizeFittingMemory';
import { estimateBoxGpuBytes } from '../../../../../tools/mcpm-workbench/src/sim/memory/estimateBoxGpuBytes';
import { GPU_BUFFER_ZONE_FROM } from '../../../../../tools/mcpm-workbench/src/sim/memory/gpuBufferZoneFrom.constant';
import { defaultGridSlice } from '../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

const GIB = 1024 ** 3;
const LANES: SimLaneCounts = { agentCount: 1_000_000, pointCount: 1_000_000 };

const barFraction = (grid: GridSlice, lanes: SimLaneCounts) =>
  estimateBoxGpuBytes(grid, lanes.agentCount, lanes.pointCount) / grid.maxBufferBytes!;

describe('voxelSizeFittingMemory', () => {
  it('keeps a voxel size that already fits, and any voxel size before the device limit is known', () => {
    const small: GridSlice = { ...defaultGridSlice, maxBufferBytes: 2 * GIB };
    expect(voxelSizeFittingMemory(small, LANES)).toBe(small.manualVoxelSizeMpc);
    const unknown: GridSlice = { ...defaultGridSlice, manualSizeMpc: [16_000, 16_000, 16_000] };
    expect(voxelSizeFittingMemory(unknown, LANES)).toBe(unknown.manualVoxelSizeMpc);
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
        [256 * 1024 ** 2, 'f32'],
      ] as const) {
        const grid: GridSlice = {
          ...defaultGridSlice,
          manualSizeMpc,
          maxBufferBytes,
          resolvedElement,
        };
        const raisedMpc = voxelSizeFittingMemory(grid, LANES);
        const raised = { ...grid, manualVoxelSizeMpc: raisedMpc };
        expect(barFraction(raised, LANES)).toBeLessThan(GPU_BUFFER_ZONE_FROM.warn);
        expect(deriveGridBox(raised).voxelSizeMpc).toBe(raisedMpc);
        if (raisedMpc === grid.manualVoxelSizeMpc) continue;
        const steps = Math.log10(raisedMpc) / VOXEL_SIZE_STEP_LOG10;
        expect(steps).toBeCloseTo(Math.round(steps), 9);
        const oneStepFiner = 10 ** (Math.log10(raisedMpc) - VOXEL_SIZE_STEP_LOG10);
        if (oneStepFiner > grid.manualVoxelSizeMpc) {
          const finer = { ...grid, manualVoxelSizeMpc: oneStepFiner };
          expect(barFraction(finer, LANES)).toBeGreaterThanOrEqual(GPU_BUFFER_ZONE_FROM.warn);
        }
      }
    }
  });

  it('stops at the coarsest grid when the lanes alone fill the warn zone', () => {
    // 1M + 1M lanes are 56 MB, past 75 % of a 64 MiB limit whatever the grid.
    const grid: GridSlice = {
      ...defaultGridSlice,
      manualSizeMpc: [16_000, 9_000, 4_000],
      maxBufferBytes: 64 * 1024 ** 2,
      resolvedElement: 'f32',
    };
    const coarsest = { ...grid, manualVoxelSizeMpc: voxelSizeFittingMemory(grid, LANES) };
    expect(deriveGridBox(coarsest).dims).toEqual([8, 8, 8]);
    expect(barFraction(coarsest, LANES)).toBeGreaterThanOrEqual(GPU_BUFFER_ZONE_FROM.warn);
  });
});
