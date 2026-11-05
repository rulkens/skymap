/**
 * throttleWithTrailingCall — `throttleByTime`'s gate, plus a trailing call for the last
 * turned-away caller. The gate arithmetic runs on a hand-driven nowMs; only the trailing
 * call needs fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { throttleWithTrailingCall } from '../../../src/utils/throttle/throttleWithTrailingCall';

describe('throttleWithTrailingCall', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a turned-away call schedules one trailing call for when the window reopens', () => {
    // Bug caught: the last turned-away call being the final word when no call follows it.
    const onTrailing = vi.fn();
    const gate = throttleWithTrailingCall(250, onTrailing);
    expect(gate.pass(0)).toBe(true);
    expect(gate.pass(16)).toBe(false);
    expect(gate.pass(32)).toBe(false);
    vi.advanceTimersByTime(249);
    expect(onTrailing).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTrailing).toHaveBeenCalledTimes(1);
    expect(gate.pass(250)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(onTrailing).toHaveBeenCalledTimes(1);
  });
});
