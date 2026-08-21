/**
 * planGridBudget — the preflight that refuses a configuration before a single
 * buffer is allocated. Every expected byte count is hand-computed from the
 * dimensions, independently of the source expression.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import {
  estimateGridBudgetBytes,
  planGridBudget,
} from '../../../../tools/mcpm-workbench/src/sim/planGridBudget';

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

// GridBoxPanel's live memory readout reuses this function directly (rather than
// re-deriving the formula) so it can't silently drop the agent-lane term the
// way an earlier version did.
describe('estimateGridBudgetBytes', () => {
  it('sums the grid term and the agent term, hand-computed', () => {
    // dims 8x8x8 = 512 voxels; f32 grid = 512*4 = 2048 bytes/grid, three
    // grids = 6144. 7 agent lanes x 100 agents x 4 bytes/entry = 2800.
    expect(estimateGridBudgetBytes([8, 8, 8], 100, 'f32')).toBe(6144 + 2800);
  });

  it('the agent term dominates at high agent count on a coarse grid', () => {
    // A coarse 56^3 grid (reachable at the panel's own 4 Mpc max voxel size
    // on the default 200 Mpc box) next to the agent slider's 10M max: the
    // agent-lane term outweighs the grid term by two orders of magnitude.
    const gridOnly = estimateGridBudgetBytes([56, 56, 56], 0, 'f32');
    const withMaxAgents = estimateGridBudgetBytes([56, 56, 56], 10_000_000, 'f32');
    expect(withMaxAgents - gridOnly).toBe(7 * 10_000_000 * 4);
    expect(withMaxAgents).toBeGreaterThan(gridOnly * 100);
  });
});
