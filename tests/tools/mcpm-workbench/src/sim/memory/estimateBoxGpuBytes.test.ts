/**
 * estimateBoxGpuBytes — the live GPU memory figure: three grids plus seven agent
 * lanes, catalog points included (they share the lanes with the free agents).
 */
import { describe, expect, it } from 'vitest';
import { estimateBoxGpuBytes } from '../../../../../../tools/mcpm-workbench/src/sim/memory/estimateBoxGpuBytes';
import { defaultGridSlice } from '../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';

describe('estimateBoxGpuBytes', () => {
  it('counts three f32 grids and seven lanes of points plus agents', () => {
    // The default box is 272³ voxels: 20_123_648 × 4 bytes per grid; lanes 4 bytes per entry.
    const grids = 3 * 20_123_648 * 4;
    expect(estimateBoxGpuBytes(defaultGridSlice, 2_000_000, 0)).toBe(grids + 7 * 4 * 2_000_000);
    expect(estimateBoxGpuBytes(defaultGridSlice, 2_000_000, 1_000_000)).toBe(
      grids + 7 * 4 * 3_000_000,
    );
  });
});
