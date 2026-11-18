import { describe, expect, it } from 'vitest';
import { easedClockProfile } from '../../../src/utils/time/easedClockProfile';
import { interpolateClockProfile } from '../../../src/utils/time/interpolateClockProfile';

describe('easedClockProfile', () => {
  const p = easedClockProfile(100, 100.5, 2000, 'easeInOutSine', 1000);
  const at = (w: number) => interpolateClockProfile(p, 1000 + w);

  it('starts at from, lands exactly on to, and ascends', () => {
    expect(at(0)).toBe(100);
    expect(at(2000)).toBe(100.5);
    for (let i = 1; i < p.simDays.length; i++) {
      expect(p.simDays[i]!).toBeGreaterThan(p.simDays[i - 1]!);
      expect(p.wallMs[i]!).toBeGreaterThan(p.wallMs[i - 1]!);
    }
  });

  it('eases: half way at the midpoint, a small first step', () => {
    expect(at(1000)).toBeCloseTo(100.25, 6);
    expect(p.simDays[1]! - p.simDays[0]!).toBeLessThan((0.5 / (p.simDays.length - 1)) * 0.1);
  });
});
