/**
 * throttleByTime — the gate's contract is "opens at most once per interval,
 * measured from the last opening, driven only by the caller-supplied nowMs".
 *
 * The sequence test drives a hand-built `nowMs` list (never a wall clock or fake
 * timer) so the interval arithmetic is the only thing under test: the first call
 * opens, a sub-interval call is blocked, and the gate reopens exactly when nowMs
 * has advanced a full interval past the last opening.
 */

import { describe, it, expect } from 'vitest';

import { throttleByTime } from '../../../src/utils/throttle/throttleByTime';

describe('throttleByTime', () => {
  it('gates to at most once per interval on a hand-driven nowMs sequence', () => {
    const gate = throttleByTime(250);
    expect(gate(0)).toBe(true); // first call always opens
    expect(gate(100)).toBe(false); // 100 < 250 since last opening (t=0)
    expect(gate(250)).toBe(true); // exactly 250 past t=0 reopens
  });

  it('measures the interval from the last opening, not the last call', () => {
    const gate = throttleByTime(250);
    expect(gate(0)).toBe(true); // opens at t=0
    expect(gate(200)).toBe(false); // blocked; does NOT push the next opening out
    expect(gate(250)).toBe(true); // still 250 past t=0, so it reopens
  });
});
