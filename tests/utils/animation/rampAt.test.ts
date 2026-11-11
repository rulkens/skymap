import { describe, expect, it } from 'vitest';

import { rampAt } from '../../../src/utils/animation/rampAt';

describe('rampAt', () => {
  it('mid-ramp value and remaining time', () => {
    const changes = [{ atSec: 2, to: 1, overMs: 4000 }];
    expect(rampAt(0, changes, 4)).toEqual({ value: 0.5, target: 1, remainingMs: 2000 });
  });

  it('a change mid-ramp starts from where the ramp stood', () => {
    // At 2 s the first ramp stands at smoothstep(0.5) = 0.5; the second runs 0.5 → 0 over 1 s,
    // so at 2.5 s it reads 0.5 · (1 − smoothstep(0.5)) = 0.25.
    const changes = [
      { atSec: 0, to: 1, overMs: 4000 },
      { atSec: 2, to: 0, overMs: 1000 },
    ];
    expect(rampAt(0, changes, 2.5)).toEqual({ value: 0.25, target: 0, remainingMs: 500 });
  });

  it('after the last ramp: its target, nothing remaining; before the first change: null', () => {
    const changes = [{ atSec: 1, to: 1, overMs: 600 }];
    expect(rampAt(0, changes, 5)).toEqual({ value: 1, target: 1, remainingMs: 0 });
    expect(rampAt(0, changes, 0.5)).toBeNull();
  });

  it('a zero-length change is a step at its instant', () => {
    expect(rampAt(1, [{ atSec: 3, to: 0, overMs: 0 }], 3)).toEqual({
      value: 0,
      target: 0,
      remainingMs: 0,
    });
  });
});
