import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleTimer } from '../../../../src/main/sky/utils/createIdleTimer';

describe('createIdleTimer', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('goes idle with no poke at all, and wakes on the next poke only once', () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    const timer = createIdleTimer(3000, onIdle, onActive);
    vi.advanceTimersByTime(2999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    timer.poke();
    timer.poke();
    expect(onActive).toHaveBeenCalledOnce();
  });

  it('restarts the count on every poke, so a moving cursor never hides', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(3000, onIdle, vi.fn());
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(2000);
      timer.poke();
    }
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('stays quiet after stop', () => {
    const onIdle = vi.fn();
    createIdleTimer(3000, onIdle, vi.fn()).stop();
    vi.advanceTimersByTime(10_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
