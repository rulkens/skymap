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
      profile: null,
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
      profile: null,
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
      profile: null,
    };
    // ΔrealSec = 24 real seconds ⇒ 3600·24/86400 = 1 sim day forward.
    expect(deriveSimDays(time, 24_000)).toBe(101);
  });

  describe('with a mission profile', () => {
    const profiled: TimeState = {
      mode: 'manual',
      anchor: { simDays: 2_460_000, realMs: 1_000 },
      rateIndex: 0,
      direction: 1,
      paused: false,
      profile: {
        startWallMs: 1_000,
        wallMs: Float64Array.from([0, 1_000, 3_000]),
        simDays: Float64Array.from([10, 12, 20]),
        speedIndex: 2,
      },
    };

    it('interpolates linearly inside a segment', () => {
      expect(deriveSimDays(profiled, 1_500)).toBe(11);
      expect(deriveSimDays(profiled, 3_000)).toBe(16);
    });

    it('clamps before the start and after the end', () => {
      expect(deriveSimDays(profiled, 0)).toBe(10);
      expect(deriveSimDays(profiled, 1_000_000)).toBe(20);
    });
  });
});
