/**
 * manualPausedAtActions / enterManualPausedAt — the shared-`nowMs` pin.
 *
 * The load-bearing test is the first one: `setSimDays` anchors `realMs` to the
 * `nowMs` it is handed and `pause` re-anchors off that same value, so the two
 * payloads must carry ONE sample. `performance.now` is stubbed to advance on
 * every read, which makes a second sample (or a caller-supplied `nowMs` threaded
 * in at a different moment) show up as two different numbers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  manualPausedAtActions,
  enterManualPausedAt,
} from '../../../src/state/time/enterManualPausedAt';
import timeReducer, { setSimDays, pause } from '../../../src/state/time/timeSlice';
import type { TimeState } from '../../../src/@types/time/TimeState';
import type { AppDispatch } from '../../../src/store/types';

const INSTANT = new Date('2026-07-29T12:00:00Z');

/** `performance.now` that advances 1000 ms per read — a second sample cannot alias. */
function stubTickingClock(): void {
  let reads = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    reads += 1;
    return reads * 1_000;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('manualPausedAtActions', () => {
  it('threads one nowMs sample through both actions', () => {
    stubTickingClock();

    const [scrub, freeze] = manualPausedAtActions(INSTANT) as [
      ReturnType<typeof setSimDays>,
      ReturnType<typeof pause>,
    ];

    expect(scrub.payload.nowMs).toBe(freeze.payload.nowMs);
  });
});

describe('a t= restore while riding', () => {
  // Review focus 4: the hash's scrub-and-pause pair is a visitor action like any other.
  it('clears the ride profile', () => {
    const riding = {
      mode: 'manual' as const,
      anchor: { simDays: 2460000, realMs: 0 },
      rateIndex: 0,
      direction: 1 as const,
      paused: false,
      profile: {
        startWallMs: 0,
        wallMs: Float64Array.from([0, 10_000]),
        simDays: Float64Array.from([2460000, 2460010]),
      },
    };
    let after: TimeState = riding;
    for (const action of manualPausedAtActions(INSTANT)) after = timeReducer(after, action);
    expect(after.profile).toBeNull();
    expect(after.paused).toBe(true);
  });
});
