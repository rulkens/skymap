/**
 * estimateBoxGpuBytes — the live GPU memory figure must match what the build
 * then allocates, catalog points included (they share the agent lanes).
 */
import { describe, expect, it } from 'vitest';
import { deriveGridBox } from '../../../../tools/mcpm-workbench/src/field/deriveGridBox';
import { estimateBoxGpuBytes } from '../../../../tools/mcpm-workbench/src/sim/estimateBoxGpuBytes';
import { planGridBudget } from '../../../../tools/mcpm-workbench/src/sim/planGridBudget';
import { defaultGridSlice } from '../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

const GENEROUS = { maxBufferSize: 2 ** 40, maxStorageBufferBindingSize: 2 ** 40 };

describe('estimateBoxGpuBytes', () => {
  it('with N points equals what planGridBudget totals for a build with N points in the box', () => {
    const agentCount = 2_000_000;
    for (const pointCount of [0, 1_000_000]) {
      const built = planGridBudget(
        deriveGridBox(defaultGridSlice),
        pointCount + agentCount,
        'f32',
        GENEROUS,
      );
      expect(estimateBoxGpuBytes(defaultGridSlice, agentCount, pointCount)).toBe(built.totalBytes);
    }
  });
});
