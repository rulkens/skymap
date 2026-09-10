/**
 * bodyUpWeight — the tilt-blend curve (ruling 8, user ruling 2026-09-10) under
 * the blend-space toggle (ruling 11): 'log' (trial default) interpolates over
 * log(h/R), so the half-weight point sits at the window's GEOMETRIC midpoint —
 * zoom is multiplicative, and equal notches spend equal band. The curve reads
 * TILT_BAND, tunable independently of the regime hysteresis.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { setTiltBand, TILT_BAND } from '../../../src/data/camera/tiltBand';

// Restore what module load SAW, not literals — the records are mutable
// session state and the defaults must never fork between src and tests.
const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const BAND_AT_LOAD = { fullHR: TILT_BAND.fullHR, zeroHR: TILT_BAND.zeroHR };

afterEach(() => {
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
  setTiltBand(BAND_AT_LOAD);
});

describe('bodyUpWeight', () => {
  it('log space: 0.5 at the geometric midpoint, exact 1/0 at the edges, monotone', () => {
    const { fullHR, zeroHR } = TILT_BAND;
    expect(bodyUpWeight(Math.sqrt(fullHR * zeroHR))).toBeCloseTo(0.5, 12);
    expect(bodyUpWeight(fullHR)).toBe(1);
    expect(bodyUpWeight(zeroHR)).toBe(0);
    // An at-surface pose (h/R → 0) must not NaN through the log.
    expect(bodyUpWeight(0)).toBe(1);
    // Sweep a window derived from the band itself (never a literal range) so
    // it still spans below-full to above-zero wherever the edges are tuned.
    let prev = Infinity;
    const lo = fullHR * 0.1;
    const hi = zeroHR * 3;
    const steps = 500;
    for (let i = 0; i <= steps; i += 1) {
      const w = bodyUpWeight(lo + ((hi - lo) * i) / steps);
      expect(w).toBeLessThanOrEqual(prev + 1e-15);
      prev = w;
    }
  });

  it('lin space: 0.5 at the arithmetic midpoint — the spaces genuinely differ', () => {
    ORIENT_TUNING.blendSpace = 'lin';
    const { fullHR, zeroHR } = TILT_BAND;
    expect(bodyUpWeight((fullHR + zeroHR) / 2)).toBeCloseTo(0.5, 12);
    // The geometric mean sits below the arithmetic one (AM-GM), so the linear
    // curve reads > 0.5 there — a space toggle that did nothing would fail
    // this. Holds regardless of the band's absolute scale.
    expect(bodyUpWeight(Math.sqrt(fullHR * zeroHR))).toBeGreaterThan(0.55);
  });

  it('the tilt-blend sliders retune this curve', () => {
    setTiltBand({ fullHR: 0.1, zeroHR: 0.4 });
    expect(bodyUpWeight(Math.sqrt(0.1 * 0.4))).toBeCloseTo(0.5, 12);
    expect(bodyUpWeight(0.1)).toBe(1);
    expect(bodyUpWeight(0.4)).toBe(0);
  });
});
