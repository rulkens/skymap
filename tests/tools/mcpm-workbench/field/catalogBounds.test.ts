/**
 * catalogBounds — per-axis min/max over interleaved xyz positions.
 */
import { describe, expect, it } from 'vitest';
import { catalogBounds } from '../../../../tools/mcpm-workbench/src/field/catalogBounds';

describe('catalogBounds', () => {
  it('returns per-axis min and max over interleaved xyz', () => {
    // prettier-ignore
    const positions = new Float32Array([
      1, -2, 3,
      -5, 4, 0,
      2, 2, -7,
      0, 9, 1,
    ]);
    const { min, max } = catalogBounds(positions);
    expect(min).toEqual([-5, -2, -7]);
    expect(max).toEqual([2, 9, 3]);
  });

  it('ignores nothing — a single point yields min === max', () => {
    const positions = new Float32Array([4, -6, 8]);
    const { min, max } = catalogBounds(positions);
    expect(min).toEqual([4, -6, 8]);
    expect(max).toEqual([4, -6, 8]);
  });
});
