/**
 * goLiveNowAction — the mixed-clock pairing.
 *
 * `goLive`'s payload combines a `Date.now()` read (`simDays`) with a
 * `performance.now()` read (`nowMs`); `deriveSimDays` treats `anchor.realMs`
 * as a monotonic-clock stamp, so the two reads must land on the SAME instant
 * or "live" is anchored with a skew baked in. Both clocks are stubbed to
 * advance on every read, mirroring `enterManualPausedAt.test.ts`'s ticking
 * stub: if a future edit reintroduced a second read of either clock, that
 * second read would return a later tick and the assertion below — which
 * pins both fields to the FIRST tick of each clock — would catch it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { goLiveNowAction } from '../../../src/state/time/goLiveNowAction';
import { goLive } from '../../../src/state/time/timeSlice';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

/** `Date.now`/`performance.now` that advance 1000 ms per read — a second sample cannot alias. */
function stubTickingClocks(): void {
  let dateReads = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    dateReads += 1;
    return dateReads * 1_000;
  });
  let perfReads = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    perfReads += 1;
    return perfReads * 1_000;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('goLiveNowAction', () => {
  it('pairs the first Date.now() read with the first performance.now() read into one goLive action', () => {
    stubTickingClocks();

    const action = goLiveNowAction();

    expect(action).toEqual(goLive({ simDays: unixMsToJulianDays(1_000), nowMs: 1_000 }));
  });
});
