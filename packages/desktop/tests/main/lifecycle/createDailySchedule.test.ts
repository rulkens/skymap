import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataUpdates } from '../../../src/@types/DataUpdates';
import { createDailySchedule } from '../../../src/main/lifecycle/createDailySchedule';

const DAILY: DataUpdates = { kind: 'daily', at: '03:00' };
const HOUR = 3600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 2, 0));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createDailySchedule', () => {
  it('runs at the set time and again the next day after a failed run', async () => {
    const run = vi.fn(() => Promise.reject(new Error('offline')));
    createDailySchedule({ run, policy: () => DAILY, dev: false })();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never holds two timers after a policy change', async () => {
    let policy: DataUpdates = DAILY;
    const run = vi.fn(() => Promise.resolve());
    const rearm = createDailySchedule({ run, policy: () => policy, dev: false });
    rearm();
    policy = { kind: 'daily', at: '02:30' };
    rearm();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a policy other than daily, or a dev run, never arms', async () => {
    const run = vi.fn(() => Promise.resolve());
    createDailySchedule({ run, policy: () => ({ kind: 'manual' }), dev: false })();
    createDailySchedule({ run, policy: () => DAILY, dev: true })();
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(run).not.toHaveBeenCalled();
  });
});
