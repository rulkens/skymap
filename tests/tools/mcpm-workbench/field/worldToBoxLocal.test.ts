/**
 * worldToBoxLocal — box below has centerMpc=[10,-4,6], sizeMpc=[24,16,8]
 * (dims × voxelSizeMpc=1, per GridBox's own invariant), so halfExtentMpc =
 * [12,8,4] and the lower corner (hand-computed, not via the function under
 * test) is centerMpc - halfExtentMpc = [-2,-12,2].
 */
import { describe, expect, it } from 'vitest';
import { worldToBoxLocal } from '../../../../tools/mcpm-workbench/src/field/worldToBoxLocal';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';

const box: GridBox = {
  centerMpc: [10, -4, 6],
  sizeMpc: [24, 16, 8],
  dims: [24, 16, 8],
  voxelSizeMpc: 1,
};

describe('worldToBoxLocal', () => {
  it('maps the box lower corner to the zero vector', () => {
    expect(worldToBoxLocal(box, [-2, -12, 2])).toEqual([0, 0, 0]);
  });

  it('maps a known point to its hand-computed box-local coordinate', () => {
    // local = p - centerMpc + halfExtentMpc
    expect(worldToBoxLocal(box, [12, 2, 9])).toEqual([14, 14, 7]);
  });
});
