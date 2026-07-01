/**
 * trapezoidEase — a timing envelope with tunable ramp length: ease in over the
 * first `f` of the take, cruise at constant speed through the middle, ease out
 * over the last `f`. Smaller `f` = shorter accel/decel + longer cruise; `f=0.5`
 * collapses the cruise into a smooth S (≈ the cubic inOut feel).
 *
 * Contracts: pins the ends (0→0, 1→1), reaches rest at both ends, is monotone
 * non-decreasing, symmetric (pos(s)+pos(1-s)=1), and a shorter ramp covers more
 * ground by quarter-time (the cruise has already begun).
 */

import { describe, it, expect } from 'vitest';
import { trapezoidEase } from '../../../src/utils/math/trapezoidEase';

describe('trapezoidEase', () => {
  it('pins the endpoints', () => {
    expect(trapezoidEase(0, 0.25)).toBe(0);
    expect(trapezoidEase(1, 0.25)).toBe(1);
  });

  it('is symmetric about the midpoint', () => {
    for (const f of [0.1, 0.25, 0.4, 0.5]) {
      expect(trapezoidEase(0.5, f)).toBeCloseTo(0.5, 9);
      for (const s of [0.05, 0.2, 0.37]) {
        expect(trapezoidEase(s, f) + trapezoidEase(1 - s, f)).toBeCloseTo(1, 9);
      }
    }
  });

  it('is monotone non-decreasing', () => {
    for (const f of [0.05, 0.2, 0.5]) {
      let prev = -Infinity;
      for (let i = 0; i <= 200; i++) {
        const cur = trapezoidEase(i / 200, f);
        expect(cur).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = cur;
      }
    }
  });

  it('a shorter ramp covers more ground by quarter-time (cruise already begun)', () => {
    // At s=0.25 a short ramp (f=0.1) is well into the constant-speed cruise,
    // while a long ramp (f=0.5) is still accelerating from rest.
    expect(trapezoidEase(0.25, 0.1)).toBeGreaterThan(trapezoidEase(0.25, 0.5));
  });

  it('clamps out-of-range inputs gracefully', () => {
    expect(trapezoidEase(-1, 0.25)).toBe(0);
    expect(trapezoidEase(2, 0.25)).toBe(1);
  });
});
