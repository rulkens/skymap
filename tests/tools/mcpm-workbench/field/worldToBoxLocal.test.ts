/**
 * worldToBoxLocal — box below has centerMpc=[10,-4,6], sizeMpc=[24,16,8]
 * (dims × voxelSizeMpc=1, per GridBox's own invariant), so halfExtentMpc =
 * [12,8,4] and the lower corner (hand-computed, not via the function under
 * test) is centerMpc - halfExtentMpc = [-2,-12,2].
 */
import { describe, expect, it } from 'vitest';
import { worldToBoxLocal } from '../../../../tools/mcpm-workbench/src/field/worldToBoxLocal';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';

const box: GridBox = {
  centerMpc: [10, -4, 6],
  sizeMpc: [24, 16, 8],
  dims: [24, 16, 8],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

describe('worldToBoxLocal', () => {
  it('maps the box lower corner to the zero vector', () => {
    expect(worldToBoxLocal(box, [-2, -12, 2])).toEqual([0, 0, 0]);
  });

  it('maps a known point to its hand-computed box-local coordinate', () => {
    // local = p - centerMpc + halfExtentMpc
    expect(worldToBoxLocal(box, [12, 2, 9])).toEqual([14, 14, 7]);
  });

  it('at a 90°-about-Y rotation matches a hand-computed local coordinate', () => {
    // A quaternion for +90° about Y rotates (x,y,z) -> (x cosθ + z sinθ, y, -x sinθ + z cosθ),
    // which at θ=90° is (z, y, -x). R⁻¹ here is the -90° rotation, mapping (x,y,z) -> (-z, y, x)
    // (swap the sign of θ in the same formula).
    //
    // p = centerMpc + [1,2,3] = [11,-2,9], so the centered offset is [1,2,3].
    // R⁻¹([1,2,3]) = (-3, 2, 1); add halfExtentMpc=[12,8,4] -> [9, 10, 5].
    const rotated: GridBox = { ...box, rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 2) };
    const result = worldToBoxLocal(rotated, [11, -2, 9]);
    expect(result[0]).toBeCloseTo(9, 10);
    expect(result[1]).toBeCloseTo(10, 10);
    expect(result[2]).toBeCloseTo(5, 10);
  });
});
