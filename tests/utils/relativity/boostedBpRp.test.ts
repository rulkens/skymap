import { describe, expect, it } from 'vitest';
import { boostedBpRp } from '../../../src/utils/relativity/boostedBpRp';
import { STAR_TINT_BLACKBODY_ANCHORS } from '../../../src/data/voyage/starTintBlackbodyAnchors';

const OB = STAR_TINT_BLACKBODY_ANCHORS[0];
const AF = STAR_TINT_BLACKBODY_ANCHORS[1];
const G = STAR_TINT_BLACKBODY_ANCHORS[2];
const M = STAR_TINT_BLACKBODY_ANCHORS[4];

describe('boostedBpRp', () => {
  it('boostedBpRp is identity at D 1', () => {
    for (const bpRp of [-1, -0.3, 0.1, 0.85, 1.7, 3]) expect(boostedBpRp(bpRp, 1)).toBe(bpRp);
  });

  it('boostedBpRp is monotone in D', () => {
    let last = Infinity;
    for (let log2D = -4; log2D <= 4; log2D += 0.25) {
      const next = boostedBpRp(1.4, 2 ** log2D);
      expect(next).toBeLessThanOrEqual(last);
      last = next;
    }
    expect(boostedBpRp(1.4, 1.1)).toBeLessThan(1.4);
    expect(boostedBpRp(1.4, 0.9)).toBeGreaterThan(1.4);
  });

  // 3 500 K × 2 = 7 000 K, between the A/F (7 500 K) and G (5 800 K) anchors.
  it('an M star at D 2 lands between the A/F and G anchors', () => {
    const seen = boostedBpRp(M.bpRp, 2);
    expect(seen).toBeGreaterThan(AF.bpRp);
    expect(seen).toBeLessThan(G.bpRp);
  });

  it('boostedBpRp round-trips an anchor temperature onto its anchor', () => {
    expect(boostedBpRp(M.bpRp, G.temperatureK / M.temperatureK)).toBeCloseTo(G.bpRp, 12);
  });

  it('boostedBpRp clamps at the table ends', () => {
    expect(boostedBpRp(0.85, 1e6)).toBe(OB.bpRp);
    expect(boostedBpRp(0.85, 1e-6)).toBe(M.bpRp);
  });
});
