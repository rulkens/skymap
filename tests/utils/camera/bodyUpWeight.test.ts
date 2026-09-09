/**
 * bodyUpWeight — the ONE band curve (rulings 8 + 10) under the blend-space
 * toggle (ruling 11): 'log' (trial default) interpolates over log(h/R), so
 * the half-weight point sits at the window's GEOMETRIC midpoint — zoom is
 * multiplicative, and equal notches spend equal band. The sliders retune the
 * same record both the regime hysteresis and this curve read, so the
 * one-home invariant is what these fixtures pin.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { setSurfaceBand, SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';

// Restore what module load SAW, not literals — the records are mutable
// session state and the defaults must never fork between src and tests.
const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const BAND_AT_LOAD = {
  engageHR: SURFACE_REGIME.engageHR,
  disengageHR: SURFACE_REGIME.disengageHR,
};

afterEach(() => {
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
  setSurfaceBand(BAND_AT_LOAD);
});

describe('bodyUpWeight', () => {
  it('log space: 0.5 at the geometric midpoint, exact 1/0 at the edges, monotone', () => {
    const { engageHR, disengageHR } = SURFACE_REGIME;
    expect(bodyUpWeight(Math.sqrt(engageHR * disengageHR))).toBeCloseTo(0.5, 12);
    expect(bodyUpWeight(engageHR)).toBe(1);
    expect(bodyUpWeight(disengageHR)).toBe(0);
    // An at-surface pose (h/R → 0) must not NaN through the log.
    expect(bodyUpWeight(0)).toBe(1);
    // Sweep a window derived from the band itself (never a literal range) so
    // it still spans below-engage to above-disengage after ruling 19 moved
    // the edges close together.
    let prev = Infinity;
    const lo = engageHR * 0.1;
    const hi = disengageHR * 3;
    const steps = 500;
    for (let i = 0; i <= steps; i += 1) {
      const w = bodyUpWeight(lo + ((hi - lo) * i) / steps);
      expect(w).toBeLessThanOrEqual(prev + 1e-15);
      prev = w;
    }
  });

  it('lin space: 0.5 at the arithmetic midpoint — the spaces genuinely differ', () => {
    ORIENT_TUNING.blendSpace = 'lin';
    const { engageHR, disengageHR } = SURFACE_REGIME;
    expect(bodyUpWeight((engageHR + disengageHR) / 2)).toBeCloseTo(0.5, 12);
    // The geometric mean sits below the arithmetic one (AM-GM), so the linear
    // curve reads > 0.5 there — a space toggle that did nothing would fail
    // this. Holds regardless of the band's absolute scale.
    expect(bodyUpWeight(Math.sqrt(engageHR * disengageHR))).toBeGreaterThan(0.55);
  });

  it('the sliders retune the SAME curve (one home, ruling 10)', () => {
    setSurfaceBand({ engageHR: 2.0, disengageHR: 4.0 });
    expect(bodyUpWeight(Math.sqrt(2.0 * 4.0))).toBeCloseTo(0.5, 12);
    expect(bodyUpWeight(2.0)).toBe(1);
    expect(bodyUpWeight(4.0)).toBe(0);
  });
});
