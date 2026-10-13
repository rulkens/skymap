// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimInstant } from '../../src/hooks/useSimInstant';
import type { TimeState } from '../../src/@types/time/TimeState';
import { unixMsToJulianDays } from '../../src/utils/time/unixMsToJulianDays';

const RUNNING: TimeState = {
  mode: 'manual',
  // Half a second past a minute: float error in the JD round trip cannot cross the boundary.
  anchor: { simDays: unixMsToJulianDays(Date.UTC(2031, 2, 3, 12, 0, 0, 500)), realMs: 0 },
  rateIndex: 0,
  direction: 1,
  paused: false,
};

function renderCounted(time: TimeState) {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useSimInstant(time);
  });
  return { hook, renders: () => renders };
}

describe('useSimInstant', () => {
  // The sim clock derives from performance.now(), which fake timers do not move in jsdom.
  let nowMs = 0;
  const advance = (ms: number) =>
    act(() => {
      nowMs += ms;
      vi.advanceTimersByTime(ms);
    });
  beforeEach(() => {
    nowMs = 0;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // The readouts show whole minutes; a fresh Date every second would re-render both at 1 Hz.
  it('re-renders on a new minute, not on every one-second tick', () => {
    const { hook, renders } = renderCounted(RUNNING);
    const first = hook.result.current;
    const before = renders();

    advance(30_000);
    expect(renders()).toBe(before);
    expect(hook.result.current).toBe(first);

    advance(30_000);
    expect(hook.result.current.getTime() - first.getTime()).toBe(60_000);
    expect(renders()).toBe(before + 1);
  });

  it('never re-renders while the clock is paused', () => {
    const { renders } = renderCounted({ ...RUNNING, paused: true });
    const before = renders();
    advance(300_000);
    expect(renders()).toBe(before);
  });

  it('clears its interval on unmount', () => {
    const { hook } = renderCounted(RUNNING);
    expect(vi.getTimerCount()).toBe(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
