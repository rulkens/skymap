/**
 * planGridBudget — the preflight that refuses a configuration before a single
 * buffer is allocated. Every expected byte count is hand-computed from the
 * dimensions, independently of the source expression.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { planGridBudget } from '../../../../tools/mcpm-workbench/src/sim/planGridBudget';

const boxOf = (dims: Vec3): GridBox => ({
  centerMpc: [0, 0, 0],
  sizeMpc: [dims[0], dims[1], dims[2]],
  dims,
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
});

// Well past anything a real adapter reports, so nothing refuses for size alone.
const GENEROUS = { maxBufferSize: 2 ** 40, maxStorageBufferBindingSize: 2 ** 40 };

describe('planGridBudget', () => {
  it('budgets a 712x1200x728 f16 grid at 1.24 GB per grid buffer', () => {
    // 712 * 1200 * 728 = 622_003_200 voxels, 2 bytes each under f16.
    const budget = planGridBudget(boxOf([712, 1200, 728]), 1_000_000, 'f16', GENEROUS);
    expect(budget.perBufferBytes.depositA).toBe(1_244_006_400);
    expect(budget.perBufferBytes.depositB).toBe(1_244_006_400);
    expect(budget.perBufferBytes.trace).toBe(1_244_006_400);
    expect(budget.refusal).toBeNull();
    // Three grids + seven f32 agent lanes of 1e6 entries (the six SoA lanes plus T20's
    // `densities` lane, which createGridBuffers.ts sizes identically).
    expect(budget.totalBytes).toBe(3 * 1_244_006_400 + 7 * 4_000_000);
  });

  it('refuses by naming the first buffer that exceeds maxBufferSize', () => {
    const budget = planGridBudget(boxOf([712, 1200, 728]), 1_000_000, 'f16', {
      maxBufferSize: 1_000_000_000,
      maxStorageBufferBindingSize: 2_000_000_000,
    });
    expect(budget.refusal?.buffer).toBe('depositA');
    expect(budget.refusal?.limitBytes).toBe(1_000_000_000);
    expect(budget.refusal?.requestedBytes).toBe(1_244_006_400);
  });

  it('names the agents buffer when only an agent lane overflows', () => {
    // A 64-cube f16 grid is 524_288 bytes; one lane of 8e6 agents is 32 MB, so
    // the lane is the only offender — and it is sized per LANE, not per SoA set.
    const budget = planGridBudget(boxOf([64, 64, 64]), 8_000_000, 'f16', {
      maxBufferSize: 33_554_432,
      maxStorageBufferBindingSize: 16_777_216,
    });
    expect(budget.refusal?.buffer).toBe('agents');
    expect(budget.refusal?.requestedBytes).toBe(32_000_000);
    // The binding limit is the tighter of the two and is the one reported.
    expect(budget.refusal?.limitBytes).toBe(16_777_216);
  });

  it('reports the largest long-axis resolution that would fit', () => {
    // 512^3 f32 = 536_870_912 bytes against a 256 MiB limit. At a fixed aspect
    // ratio the voxel count scales with the cube of the long axis, so the
    // largest multiple-of-8 axis that fits is 400 (400^3 * 4 = 256_000_000).
    const budget = planGridBudget(boxOf([512, 512, 512]), 0, 'f32', {
      maxBufferSize: 268_435_456,
      maxStorageBufferBindingSize: 268_435_456,
    });
    expect(budget.refusal?.maxLongAxis).toBe(400);
  });
});
