/**
 * waitUntil tests — verify the poll loop exits once the predicate turns true.
 *
 * The saga yields `delay(POLL_MS)` effects while the predicate is false and
 * returns as soon as it flips. We drive it with manual generator stepping so
 * the test is synchronous and deterministic — no fake timers needed.
 *
 * Manual stepping: call `gen.next()` to advance past each `yield*`. The delay
 * effect is a yielded value that `runSaga` would await; we ignore the value and
 * advance past it, simulating "the timer fired". The generator completes
 * (`.done === true`) once the predicate is true.
 */

import { describe, it, expect } from 'vitest';
import { waitUntil } from '../../../src/state/tour/waitUntil';

describe('waitUntil', () => {
  it('returns immediately when the predicate is already true', () => {
    const gen = waitUntil(() => true);
    const result = gen.next();
    // The predicate is true on entry — the while loop body never executes, so
    // the generator completes on the first `.next()`.
    expect(result.done).toBe(true);
  });

  it('polls until the predicate turns true', () => {
    let calls = 0;
    // The predicate is false for the first two polls, then true.
    const pred = () => {
      calls++;
      return calls >= 3;
    };

    const gen = waitUntil(pred);

    // First poll: pred() → false (calls=1). Generator yields delay — not done.
    const step1 = gen.next();
    expect(step1.done).toBe(false);

    // Advance past the delay (simulate timer expiry). pred() → false (calls=2). Yields delay again.
    const step2 = gen.next();
    expect(step2.done).toBe(false);

    // Advance past the second delay. pred() → true (calls=3). Loop exits — done.
    const step3 = gen.next();
    expect(step3.done).toBe(true);
  });

  it('calls the predicate on each poll until it succeeds', () => {
    let count = 0;
    const pred = () => {
      count++;
      return count === 2;
    };

    const gen = waitUntil(pred);
    gen.next(); // pred() returns false → yields delay
    gen.next(); // pred() returns true → done

    // Two predicate calls: one that returned false, one that returned true.
    expect(count).toBe(2);
  });
});
