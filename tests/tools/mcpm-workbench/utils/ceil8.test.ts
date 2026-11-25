import { describe, expect, it } from 'vitest';
import { ceil8 } from '../../../../tools/mcpm-workbench/src/utils/ceil8';

describe('ceil8', () => {
  it('rounds a voxel count up to whole 8-voxel blocks, never below one block', () => {
    expect(ceil8(266.67)).toBe(272);
    expect(ceil8(272)).toBe(272);
    expect(ceil8(1e-9)).toBe(8);
  });

  it('ignores float dust above a whole block (24 × 0.1 / 0.1)', () => {
    const dusty = (24 * 0.1) / 0.1;
    expect(dusty).toBeGreaterThan(24);
    expect(ceil8(dusty)).toBe(24);
  });
});
