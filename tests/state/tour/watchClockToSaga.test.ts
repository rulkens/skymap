/**
 * watchClockToSaga — a tour beat's `clockTo` cue, run through the app store so the root-saga
 * fork is covered too. Fake timers fake `performance.now`, which both the saga and the
 * derivation read; the end-pause sits behind a saga `delay`, hence the async advances.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { clockTo } from '../../../src/state/tour/clockTo';
import { pause, setSimDays } from '../../../src/state/time/timeSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';

const JD = 2_460_000;

function pausedStore() {
  const { store } = createAppStore();
  store.dispatch(setSimDays({ simDays: JD, nowMs: performance.now() }));
  store.dispatch(pause({ nowMs: performance.now() }));
  const at = () => deriveSimDays(store.getState().time, performance.now());
  return { store, at };
}

describe('watchClockToSaga', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('overSec 0 snaps the clock to simDays and leaves it paused', () => {
    const { store } = createAppStore();
    store.dispatch(pause({ nowMs: performance.now() }));
    store.dispatch(clockTo({ simDays: JD, overSec: 0 }));
    vi.advanceTimersByTime(5_000);

    expect(deriveSimDays(store.getState().time, performance.now())).toBe(JD);
    expect(store.getState().time.paused).toBe(true);
  });

  it('a timed clockTo runs from the live instant to simDays over overSec, then pauses there', async () => {
    const { store, at } = pausedStore();
    store.dispatch(clockTo({ simDays: JD + 0.5, overSec: 10 }));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(at()).toBeGreaterThan(JD);
    expect(at()).toBeLessThan(JD + 0.5);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(at()).toBe(JD + 0.5);
    expect(store.getState().time.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(at()).toBe(JD + 0.5);
  });

  it('a snap during a running profile replaces it', () => {
    const { store, at } = pausedStore();
    store.dispatch(clockTo({ simDays: JD + 0.5, overSec: 10 }));
    vi.advanceTimersByTime(3_000);
    store.dispatch(clockTo({ simDays: JD, overSec: 0 }));

    expect(at()).toBe(JD);
    vi.advanceTimersByTime(5_000);
    expect(at()).toBe(JD);
    expect(store.getState().time.profile).toBeNull();
  });

  it('the action sits outside the time route', () => {
    expect(clockTo.type.startsWith('time/')).toBe(false);
  });
});
