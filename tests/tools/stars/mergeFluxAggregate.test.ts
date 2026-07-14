import { describe, expect, it } from 'vitest';
import { mergeFluxAggregate } from '../../../tools/stars/mergeFluxAggregate';

describe('mergeFluxAggregate', () => {
  it('sums flux to a brighter magnitude', () => {
    // Two stars of equal absolute magnitude glow together with TWICE the flux
    // of one, so the aggregate is brighter (smaller magnitude) by exactly
    // 2.5·log10(2) = 0.7525749891599530. A magnitude-average bug would return
    // the input magnitude unchanged and fail this. m = 4.0 is arbitrary.
    const merged = mergeFluxAggregate([
      { position: [0, 0, 0], absMag: 4.0, bpRp: 1.0 },
      { position: [0, 0, 0], absMag: 4.0, bpRp: 1.0 },
    ]);
    expect(merged.absMag).toBeCloseTo(4.0 - 0.752574989159953, 12);
  });

  it('centroid and colour are flux-weighted', () => {
    // Bright child (absMag 0 → flux 1) at the origin, blue (bpRp 0); faint
    // child (absMag 5 → flux 10^-2 = 0.01) at x=10, red (bpRp 2). Total flux
    // 1.01, so the flux-weighted centroid and colour sit almost entirely at the
    // bright child, NOT at the arithmetic mean (x=5, bpRp=1):
    //   x    = (1·0 + 0.01·10) / 1.01 = 0.09900990099009901
    //   bpRp = (1·0 + 0.01·2)  / 1.01 = 0.019801980198019802
    const merged = mergeFluxAggregate([
      { position: [0, 0, 0], absMag: 0, bpRp: 0 },
      { position: [10, 0, 0], absMag: 5, bpRp: 2 },
    ]);
    expect(merged.position[0]).toBeCloseTo(0.09900990099009901, 12);
    expect(merged.position[1]).toBe(0);
    expect(merged.position[2]).toBe(0);
    expect(merged.bpRp).toBeCloseTo(0.019801980198019802, 12);
  });
});
