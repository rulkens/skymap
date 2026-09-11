/**
 * bodyUpWeight — the tilt-blend curve (ruling 8, user ruling 2026-09-10) under
 * the blend-space toggle (ruling 11): 'log' (trial default) interpolates over
 * log(h/R), so the half-weight point sits at the window's GEOMETRIC midpoint —
 * zoom is multiplicative, and equal notches spend equal band.
 */

import { describe, it, expect } from 'vitest';

import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import { DEFAULT_CAMERA_TUNING } from '../../../src/data/camera/cameraTuning';

const { tiltFullHR, tiltZeroHR } = DEFAULT_CAMERA_TUNING;

describe('bodyUpWeight', () => {
  it('log space: 0.5 at the geometric midpoint, exact 1/0 at the edges, monotone', () => {
    const t = DEFAULT_CAMERA_TUNING;
    expect(bodyUpWeight(Math.sqrt(tiltFullHR * tiltZeroHR), t)).toBeCloseTo(0.5, 12);
    expect(bodyUpWeight(tiltFullHR, t)).toBe(1);
    expect(bodyUpWeight(tiltZeroHR, t)).toBe(0);
    // An at-surface pose (h/R → 0) must not NaN through the log.
    expect(bodyUpWeight(0, t)).toBe(1);
    // Sweep a window derived from the band itself (never a literal range) so
    // it still spans below-full to above-zero wherever the edges are tuned.
    let prev = Infinity;
    const lo = tiltFullHR * 0.1;
    const hi = tiltZeroHR * 3;
    const steps = 500;
    for (let i = 0; i <= steps; i += 1) {
      const w = bodyUpWeight(lo + ((hi - lo) * i) / steps, t);
      expect(w).toBeLessThanOrEqual(prev + 1e-15);
      prev = w;
    }
  });

  it('lin space: 0.5 at the arithmetic midpoint — the spaces genuinely differ', () => {
    const t = { ...DEFAULT_CAMERA_TUNING, blendSpace: 'lin' } as const;
    expect(bodyUpWeight((tiltFullHR + tiltZeroHR) / 2, t)).toBeCloseTo(0.5, 12);
    // The geometric mean sits below the arithmetic one (AM-GM), so the linear
    // curve reads > 0.5 there — a space toggle that did nothing would fail
    // this. Holds regardless of the band's absolute scale.
    expect(bodyUpWeight(Math.sqrt(tiltFullHR * tiltZeroHR), t)).toBeGreaterThan(0.55);
  });
});
