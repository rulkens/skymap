import { describe, expect, it } from 'vitest';

import { levelForMagnitude } from '../../../tools/octree/levelForMagnitude';

const grid = { bits: 10, cellEdge: 23.4 };
const stratify = { thr: 0.16, mLim: 10, refUnit: 10 };

describe('levelForMagnitude', () => {
  it('hand-computed levels at known magnitudes', () => {
    // log2(10·10^((10 − M)/5)·0.16 / 23.4):
    // M = 10 → log2(0.0684) = −3.87 → −4, clamped to 0
    // M = −3 → log2(10·398.1·0.16 / 23.4 = 27.2) = 4.77 → 5
    // M = −6 → log2(10·1584.9·0.16 / 23.4 = 108.4) = 6.76 → 7
    expect(levelForMagnitude(10, stratify, grid)).toBe(0);
    expect(levelForMagnitude(-3, stratify, grid)).toBe(5);
    expect(levelForMagnitude(-6, stratify, grid)).toBe(7);
  });

  it('an octave of thr moves the level by exactly one', () => {
    // Fractional parts near .77 at thr, so neither thr nor 2·thr sits on a rounding boundary.
    const doubled = { ...stratify, thr: 2 * stratify.thr };
    for (const m of [0, -3, -6]) {
      expect(levelForMagnitude(m, doubled, grid)).toBe(levelForMagnitude(m, stratify, grid) + 1);
    }
  });

  it('clamps at 0 and at grid.bits', () => {
    // M = −30 → log2(10·10^8·0.16 / 23.4) = 22.7, far past the 10-bit root
    expect(levelForMagnitude(-30, stratify, grid)).toBe(10);
  });
});
