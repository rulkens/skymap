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
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
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

describe('enterManualPausedAt', () => {
  it('still dispatches both actions in order', () => {
    const dispatch = vi.fn();

    enterManualPausedAt(dispatch as unknown as AppDispatch, INSTANT);

    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
      setSimDays.type,
      pause.type,
    ]);
  });
});
