import { describe, expect, it } from 'vitest';
import { domeClockFromStatus } from '../../../src/utils/remote/domeClockFromStatus';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import type { DomeStatus } from '../../../src/@types/remote/DomeStatus';

// 2024-03-15T00:00Z; the status arrives at the phone's performance.now() of 5000 ms.
const SIM_DAYS = 2_460_384.5;
const RECEIVED_MS = 5_000;
const LIVE: DomeStatus['time'] = {
  simDays: SIM_DAYS,
  rateIndex: 0,
  direction: 1,
  paused: false,
  mode: 'live',
};
const at = (patch: Partial<DomeStatus['time']>, elapsedMs: number): number =>
  deriveSimDays(domeClockFromStatus({ ...LIVE, ...patch }, RECEIVED_MS), RECEIVED_MS + elapsedMs);

describe('domeClockFromStatus', () => {
  it('a live clock runs at one second per second, forward', () => {
    // Six hours of phone time is a quarter day.
    expect(at({}, 6 * 3_600_000)).toBeCloseTo(SIM_DAYS + 0.25, 9);
  });

  it('a paused clock holds the status instant', () => {
    expect(at({ mode: 'manual', rateIndex: 14, paused: true }, 3_600_000)).toBe(SIM_DAYS);
  });

  it('a manual clock runs at its ladder rate: 1 day/s for 30 s is 30 days on', () => {
    expect(at({ mode: 'manual', rateIndex: 6 }, 30_000)).toBeCloseTo(SIM_DAYS + 30, 9);
  });

  it('a manual clock backward runs back: 1 hr/s for 12 s is half a day earlier', () => {
    expect(at({ mode: 'manual', rateIndex: 4, direction: -1 }, 12_000)).toBeCloseTo(
      SIM_DAYS - 0.5,
      9,
    );
  });
});
