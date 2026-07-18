import { describe, expect, it } from 'vitest';

import { spectralClassFromBpRp } from '../../../src/utils/star/spectralClassFromBpRp';

// A threshold classifier: the contract is the blue→red ordering, not the exact
// bin edges. We assert a handful of hand-chosen, well-separated colours land in
// the expected bin — a monotone-classifier property, not a boundary mirror
// (nothing here restates an edge value the implementation uses).
describe('spectralClassFromBpRp', () => {
  it('bins a very blue star into the hot O/B class', () => {
    expect(spectralClassFromBpRp(-0.3)).toBe('O/B');
  });

  it('bins a Sun-like colour into the G class', () => {
    // The Sun's Gaia BP−RP is ≈ 0.82.
    expect(spectralClassFromBpRp(0.82)).toBe('G');
  });

  it('bins a very red star into the cool M class', () => {
    expect(spectralClassFromBpRp(2.5)).toBe('M');
  });

  it('is monotone from blue to red', () => {
    // Increasing BP−RP must never move a star to a hotter (earlier) class than
    // a bluer one — the ordering is the whole contract of the classifier.
    const bpRpAscending = [-0.4, 0.1, 0.5, 0.82, 1.3, 2.5];
    const order = ['O/B', 'A/F', 'G', 'K', 'M'];
    const rank = bpRpAscending.map((bpRp) => order.indexOf(spectralClassFromBpRp(bpRp)));
    for (const r of rank) expect(r).toBeGreaterThanOrEqual(0);
    rank.reduce((prev, curr) => {
      expect(curr).toBeGreaterThanOrEqual(prev);
      return curr;
    });
  });
});
