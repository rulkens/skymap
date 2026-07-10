import { describe, it, expect, vi, afterEach } from 'vitest';
import { delay } from '../../../../tools/utils/async/delay';

/**
 * `delay` is a thin Promise-ised `setTimeout`.  We use Vitest's fake
 * timers so the test runs instantly without sleeping the test process.
 */
describe('delay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified number of ms', async () => {
    vi.useFakeTimers();
    const p = delay(500);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    // Before time advances, the promise is still pending.
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Advance just past the threshold and flush microtasks.
    vi.advanceTimersByTime(500);
    await p;
    expect(resolved).toBe(true);
  });
});
