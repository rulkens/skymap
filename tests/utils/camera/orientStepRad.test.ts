/**
 * orientStepRad — the bounded orientation decay, priced per unit of log-zoom
 * (user ruling 2026-09-10, F1). Before that it was per input STEP, so a
 * deltaY-1 trackpad event spent the same 25 % of the heading as a deltaY-100
 * mouse notch and norths the view in ~0.2 s of scrolling.
 */

import { describe, it, expect } from 'vitest';

import { orientStepRad } from '../../../src/utils/camera/orientStepRad';

/** `inputAggregator`'s deltaY-100 notch: factor e^(100 · 0.001), so u = 0.1. */
const NOTCH = 0.1;

/** Spend `n` notches of `u` each on a residual, returning what is left of it. */
function residualAfter(residualRad: number, u: number, n: number): number {
  let r = residualRad;
  for (let i = 0; i < n; i += 1) r -= orientStepRad(r, u);
  return r;
}

describe('orientStepRad', () => {
  it('a factor-1 notch is inert on orientation', () => {
    expect(orientStepRad(1.2, 0)).toBe(0);
  });

  it('N notches decay exactly as much as the one notch whose factor they multiply to', () => {
    // The property that makes trackpad and mouse converge on the same heading
    // at the same altitude — it is what forces the exponential form.
    const total = Math.log(1.5);
    const one = residualAfter(0.3, total, 1);
    for (const n of [2, 10, 137]) {
      expect(residualAfter(0.3, total / n, n)).toBeCloseTo(one, 12);
    }
  });

  it('the deltaY-100 mouse notch still spends the ruled 25 % of the residual', () => {
    // Calibration: k = −ln(0.75)/0.1, so the notch reproduces the pre-ruling
    // per-step share exactly. 0.2 rad is well under the notch's 0.1 rad cap.
    expect(orientStepRad(0.2, NOTCH)).toBeCloseTo(0.05, 12);
    expect(orientStepRad(-0.2, NOTCH)).toBeCloseTo(-0.05, 12);
  });

  it('the deltaY-100 mouse notch still caps at 0.1 rad, and the cap scales with the notch', () => {
    expect(orientStepRad(3, NOTCH)).toBeCloseTo(0.1, 12);
    expect(orientStepRad(-3, NOTCH)).toBeCloseTo(-0.1, 12);
    // A tenth of that notch may spend at most a tenth of that bound, or a
    // burst of small events re-flattens the rate the exponential just fixed.
    expect(orientStepRad(3, NOTCH / 10)).toBeCloseTo(0.01, 12);
  });

  it('a trackpad twitch costs a percent where a mouse notch costs a quarter', () => {
    // The reported defect: deltaY 4 (factor 1.004) against deltaY 100.
    const twitch = orientStepRad(0.3, Math.log(1.004)) / 0.3;
    expect(twitch).toBeGreaterThan(0.005);
    expect(twitch).toBeLessThan(0.02);
  });
});
