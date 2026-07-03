/**
 * speedRamp — maps a normalised speed [0,1] to a blue→red colour for the debug
 * clip-path inspector's speed-coloured polyline. Slow = blue (cool), fast = red
 * (hot); the green/yellow middle keeps adjacent speeds distinguishable.
 */

import { describe, it, expect } from 'vitest';
import { speedRamp } from '../../../src/utils/color/speedRamp';

describe('speedRamp', () => {
  it('returns premultiplied RGBA with alpha 1', () => {
    const c = speedRamp(0.5);
    expect(c).toHaveLength(4);
    expect(c[3]).toBe(1);
  });

  it('is blue at the slow end and red at the fast end', () => {
    const slow = speedRamp(0);
    expect(slow[2]).toBeGreaterThan(slow[0]); // more blue than red
    const fast = speedRamp(1);
    expect(fast[0]).toBeGreaterThan(fast[2]); // more red than blue
  });

  it('moves monotonically from blue toward red as speed rises', () => {
    let prevRedMinusBlue = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const c = speedRamp(i / 10);
      const redMinusBlue = c[0] - c[2];
      expect(redMinusBlue).toBeGreaterThanOrEqual(prevRedMinusBlue - 1e-9);
      prevRedMinusBlue = redMinusBlue;
    }
  });

  it('clamps out-of-range inputs to the ramp ends', () => {
    expect(speedRamp(-1)).toEqual(speedRamp(0));
    expect(speedRamp(2)).toEqual(speedRamp(1));
  });
});
