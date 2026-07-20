/**
 * scalingExponent — hand-computed, independent checks of the log-log slope.
 *
 * The exponent is the harness's whole classifier signal, so it is pinned
 * against closed-form cases where the true slope is known by construction:
 * a power law `y = k·xⁿ` plots as a straight line of slope `n` in log-log
 * space, so linear → 1, constant → 0, quadratic → 2. The degenerate case
 * (fewer than two usable points after the x>0 && y>0 filter) must return
 * `NaN` rather than a spurious slope — a single point defines no line.
 */

import { describe, it, expect } from 'vitest';

import { scalingExponent } from '../../../../tools/utils/perf/scalingExponent';

describe('scalingExponent', () => {
  it('returns ~1 for a perfectly linear y = k·x', () => {
    const points = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 4, y: 8 },
    ];
    expect(scalingExponent(points)).toBeCloseTo(1, 6);
  });

  it('returns ~0 for a constant y = c (resolution-independent)', () => {
    const points = [
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 4, y: 5 },
    ];
    expect(scalingExponent(points)).toBeCloseTo(0, 6);
  });

  it('returns ~2 for a quadratic y = k·x²', () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 4, y: 16 },
    ];
    expect(scalingExponent(points)).toBeCloseTo(2, 6);
  });

  it('returns NaN for a single usable point', () => {
    expect(Number.isNaN(scalingExponent([{ x: 2, y: 3 }]))).toBe(true);
  });

  it('returns NaN when the x>0 && y>0 filter leaves fewer than two points', () => {
    // The smallest scale read 0.0 ms — filtered out, leaving one usable point.
    const points = [
      { x: 100, y: 0 },
      { x: 400, y: 2 },
    ];
    expect(Number.isNaN(scalingExponent(points))).toBe(true);
  });
});
