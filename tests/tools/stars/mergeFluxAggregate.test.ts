import { describe, expect, it } from 'vitest';
import {
  mergeFluxAggregate,
  fluxFromAbsMag,
  aggregateMeanAbsMag,
} from '../../../tools/stars/mergeFluxAggregate';

describe('mergeFluxAggregate', () => {
  it('sums flux and count so the MEAN magnitude is unchanged for equal stars', () => {
    // Two stars of equal absolute magnitude glow together with TWICE the flux
    // of one, but the aggregate stores the MEAN star flux — so its mean
    // magnitude is exactly the input magnitude, NOT 2.5·log10(2) brighter. This
    // is the anti-clamp fix: were the aggregate to store the SUMMED magnitude
    // (the old behaviour), a large subtree would saturate the single-star LUT.
    // m = 4.0 is arbitrary.
    const merged = mergeFluxAggregate([
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(4.0), starCount: 1, bpRp: 1.0 },
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(4.0), starCount: 1, bpRp: 1.0 },
    ]);
    expect(merged.starCount).toBe(2);
    expect(merged.totalFlux).toBeCloseTo(2 * fluxFromAbsMag(4.0), 12);
    // The value the record encodes: mean of two mag-4 stars is still mag 4.
    expect(aggregateMeanAbsMag(merged)).toBeCloseTo(4.0, 12);
  });

  it('carries totalFlux and starCount up through nested merges', () => {
    // A merge of aggregates (not just leaves) must keep summing flux and count
    // so a deep subtree's mean stays exact. Three mag-4 stars, merged as (2)+(1):
    // the top aggregate has starCount 3 and mean magnitude 4.
    const pairwise = mergeFluxAggregate([
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(4.0), starCount: 1, bpRp: 1.0 },
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(4.0), starCount: 1, bpRp: 1.0 },
    ]);
    const top = mergeFluxAggregate([
      pairwise,
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(4.0), starCount: 1, bpRp: 1.0 },
    ]);
    expect(top.starCount).toBe(3);
    expect(top.totalFlux).toBeCloseTo(3 * fluxFromAbsMag(4.0), 12);
    expect(aggregateMeanAbsMag(top)).toBeCloseTo(4.0, 12);
  });

  it('centroid and colour are flux-weighted', () => {
    // Bright child (absMag 0 → flux 1) at the origin, blue (bpRp 0); faint
    // child (absMag 5 → flux 10^-2 = 0.01) at x=10, red (bpRp 2). Total flux
    // 1.01, so the flux-weighted centroid and colour sit almost entirely at the
    // bright child, NOT at the arithmetic mean (x=5, bpRp=1):
    //   x    = (1·0 + 0.01·10) / 1.01 = 0.09900990099009901
    //   bpRp = (1·0 + 0.01·2)  / 1.01 = 0.019801980198019802
    const merged = mergeFluxAggregate([
      { position: [0, 0, 0], totalFlux: fluxFromAbsMag(0), starCount: 1, bpRp: 0 },
      { position: [10, 0, 0], totalFlux: fluxFromAbsMag(5), starCount: 1, bpRp: 2 },
    ]);
    expect(merged.position[0]).toBeCloseTo(0.09900990099009901, 12);
    expect(merged.position[1]).toBe(0);
    expect(merged.position[2]).toBe(0);
    expect(merged.bpRp).toBeCloseTo(0.019801980198019802, 12);
  });
});
