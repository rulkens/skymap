import { describe, it, expect } from 'vitest';
import { countAtOrBefore } from '../../../src/utils/animation/countAtOrBefore';

describe('countAtOrBefore', () => {
  it('counts a step at exactly t as applied, and every step sharing that instant', () => {
    const steps = [{ atSec: 0 }, { atSec: 2 }, { atSec: 2 }, { atSec: 5 }];
    expect(countAtOrBefore(steps, -1)).toBe(0);
    expect(countAtOrBefore(steps, 0)).toBe(1);
    expect(countAtOrBefore(steps, 1.9)).toBe(1);
    expect(countAtOrBefore(steps, 2)).toBe(3);
    expect(countAtOrBefore(steps, 99)).toBe(4);
  });
});
