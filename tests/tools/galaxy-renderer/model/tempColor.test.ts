/**
 * tempColor — port of the spike's stellar blackbody-ish color ramp
 * (galaxy-color.js:6-26). Six COLOR_STOPS, linearly interpolated between
 * neighbours; `t` is clamped to [0, 0.999] before scaling so `t=1` never
 * indexes past the last stop.
 */
import { describe, expect, it } from 'vitest';
import { tempColor } from '../../../../tools/galaxy-renderer/src/model/tempColor';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('tempColor', () => {
  it('t=0 samples the coolest stop', () => {
    const out: Vec3 = [0, 0, 0];
    tempColor(0, out);
    expect(out).toEqual([1.0, 0.36, 0.16]);
  });

  it('t=1 clamps to within one step of the hottest stop', () => {
    const out: Vec3 = [0, 0, 0];
    tempColor(1, out);
    // Spike clamps t to 0.999, so t=1 lands one f-step short of the final
    // stop [0.60, 0.72, 1.00] rather than exactly on it.
    expect(out[0]).toBeCloseTo(0.60095, 4);
    expect(out[1]).toBeCloseTo(0.7207, 4);
    expect(out[2]).toBeCloseTo(1.0, 4);
  });

  it('midpoints interpolate linearly — t exactly on stop 1', () => {
    const out: Vec3 = [0, 0, 0];
    // Stop 1 sits at t = 1 / (COLOR_STOPS.length - 1) = 1/5 = 0.2.
    tempColor(0.2, out);
    expect(out).toEqual([1.0, 0.58, 0.28]);
  });

  it('blue channel is monotone non-decreasing in t', () => {
    const out: Vec3 = [0, 0, 0];
    let prevBlue = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      tempColor(t, out);
      expect(out[2]).toBeGreaterThanOrEqual(prevBlue);
      prevBlue = out[2];
    }
  });
});
