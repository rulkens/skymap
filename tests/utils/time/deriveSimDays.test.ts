/**
 * deriveSimDays resolves the sim clock's current instant (Julian days) from the
 * user's intent (`TimeState`) plus a wall-clock `nowMs`, as a pure function.
 *
 * The values below are hand-computed, not mirrored from the implementation: each
 * case picks a `nowMs` delta chosen to land on a clean integer sim-day change so
 * the expected result can be reasoned out by hand.
 */

import { describe, it, expect } from 'vitest';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import type { TimeState } from '../../../src/@types/time/TimeState';

describe('deriveSimDays', () => {
  it('is constant across nowMs while paused', () => {
    const time: TimeState = {
      mode: 'manual',
      anchor: { simDays: 2_451_545, realMs: 1_000_000 },
      rateIndex: 2,
      direction: 1,
      paused: true,
    };
    // Paused ⇒ the anchor's simDays verbatim, no matter how far nowMs moves.
    expect(deriveSimDays(time, 1_000_000)).toBe(2_451_545);
    expect(deriveSimDays(time, 5_000_000_000)).toBe(2_451_545);
  });

  it('advances exactly one sim day per 86_400_000 ms in live mode', () => {
    const time: TimeState = {
      mode: 'live',
      anchor: { simDays: 2_451_545, realMs: 1_000_000 },
      rateIndex: 0,
      direction: 1,
      paused: false,
    };
    // Δreal = 86_400_000 ms = one real day ⇒ +1 sim day (rate 1, forward).
    expect(deriveSimDays(time, 1_000_000 + 86_400_000)).toBe(2_451_546);
  });

  it('slopes by simSecPerRealSec·direction in manual mode (forward)', () => {
    const time: TimeState = {
      mode: 'manual',
      // rateIndex 4 = '1 hr/s' (simSecPerRealSec 3600).
      anchor: { simDays: 100, realMs: 0 },
      rateIndex: 4,
      direction: 1,
      paused: false,
    };
    // ΔrealSec = 24 real seconds ⇒ 3600·24/86400 = 1 sim day forward.
    expect(deriveSimDays(time, 24_000)).toBe(101);
  });

  it('runs sim time backwards when direction is -1', () => {
    const time: TimeState = {
      mode: 'manual',
      // rateIndex 4 = '1 hr/s' (simSecPerRealSec 3600).
      anchor: { simDays: 100, realMs: 0 },
      rateIndex: 4,
      direction: -1,
      paused: false,
    };
    // Same 24 real seconds, but reversed ⇒ -1 sim day.
    const result = deriveSimDays(time, 24_000);
    expect(result).toBe(99);
    expect(result).toBeLessThan(time.anchor.simDays);
  });
});
