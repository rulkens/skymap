/**
 * withTimeout — what can break: a hung browser call (a page Chromium never
 * creates) must reject with a message naming it, and a timer left armed would
 * hold a finished tool's process open.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../../../tools/utils/async/withTimeout';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects naming the work once the deadline passes', async () => {
    vi.useFakeTimers();
    const hung = withTimeout(new Promise<never>(() => {}), 5000, 'new page');
    vi.advanceTimersByTime(5000);
    await expect(hung).rejects.toThrow('new page did not finish within 5 s');
  });

  it('settles with the work and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve(7), 5000, 'probe')).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    await expect(withTimeout(Promise.reject(new Error('boom')), 5000, 'probe')).rejects.toThrow(
      'boom',
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
