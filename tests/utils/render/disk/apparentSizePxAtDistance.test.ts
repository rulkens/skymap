import { describe, it, expect } from 'vitest';
import { apparentSizePxAtDistance } from '../../../../src/utils/render/disk/apparentSizePxAtDistance';

describe('apparentSizePxAtDistance', () => {
  it('scales linearly with diameter and pxPerRad, inversely with distance', () => {
    // 100 kpc = 0.1 Mpc at 1 Mpc, pxPerRad 1000 → (0.1/1)*1000 = 100 px
    expect(apparentSizePxAtDistance(100, 1, 1000)).toBeCloseTo(100, 10);
  });

  it('halves when distance doubles', () => {
    const near = apparentSizePxAtDistance(50, 2, 800);
    const far = apparentSizePxAtDistance(50, 4, 800);
    expect(far).toBeCloseTo(near / 2, 10);
  });
});
