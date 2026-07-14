import { describe, it, expect } from 'vitest';
import {
  milkyWayLabelAlpha,
  MILKY_WAY_LABEL_NEAR_MPC,
  MILKY_WAY_LABEL_FAR_MPC,
} from '../../../../src/services/gpu/labelLayout/milkyWayLabelVisibility';

describe('milkyWayLabelAlpha', () => {
  it('is 1.0 when camera is closer than NEAR threshold', () => {
    expect(milkyWayLabelAlpha(0)).toBe(1);
    expect(milkyWayLabelAlpha(MILKY_WAY_LABEL_NEAR_MPC * 0.5)).toBe(1);
  });

  it('is 0.0 when camera is farther than FAR threshold', () => {
    expect(milkyWayLabelAlpha(MILKY_WAY_LABEL_FAR_MPC + 1)).toBe(0);
    expect(milkyWayLabelAlpha(1000)).toBe(0);
  });

  it('smoothly fades between NEAR and FAR', () => {
    const mid = (MILKY_WAY_LABEL_NEAR_MPC + MILKY_WAY_LABEL_FAR_MPC) / 2;
    const a = milkyWayLabelAlpha(mid);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });

  it('is monotonically decreasing across the band', () => {
    const samples = 10;
    const span = MILKY_WAY_LABEL_FAR_MPC - MILKY_WAY_LABEL_NEAR_MPC;
    let prev = milkyWayLabelAlpha(MILKY_WAY_LABEL_NEAR_MPC);
    for (let i = 1; i <= samples; i++) {
      const a = milkyWayLabelAlpha(MILKY_WAY_LABEL_NEAR_MPC + (span * i) / samples);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });
});
