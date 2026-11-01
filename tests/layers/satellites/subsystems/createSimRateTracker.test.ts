import { describe, expect, it } from 'vitest';
import { createSimRateTracker } from '../../../../src/layers/satellites/subsystems/createSimRateTracker';

describe('createSimRateTracker', () => {
  it('reports 0 on the first frame', () => {
    const t = createSimRateTracker();
    t.observe(1_000_000, 5_000);
    expect(t.rate()).toBe(0);
  });

  it('measures 3600 sim ms per real ms at 1 h/s', () => {
    const t = createSimRateTracker();
    t.observe(0, 1_000);
    t.observe(3_600 * 16, 1_016);
    expect(t.rate()).toBeCloseTo(3_600);
  });

  it('ignores a second observe in the same frame', () => {
    const t = createSimRateTracker();
    t.observe(0, 1_000);
    t.observe(3_600 * 16, 1_016);
    t.observe(9_999_999, 1_016);
    expect(t.rate()).toBeCloseTo(3_600);
  });

  it('is 0 when the clock is paused', () => {
    const t = createSimRateTracker();
    t.observe(500, 1_000);
    t.observe(500, 1_016);
    expect(t.rate()).toBe(0);
  });

  it('is positive when the clock runs backwards', () => {
    const t = createSimRateTracker();
    t.observe(100_000, 1_000);
    t.observe(100_000 - 3_600 * 16, 1_016);
    expect(t.rate()).toBeCloseTo(3_600);
  });
});
