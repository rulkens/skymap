/**
 * timeSlice — unit tests for the sim-clock intent slice.
 *
 * The load-bearing test is the RE-ANCHOR CONTINUITY pin: every intent action
 * must leave the *derived* sim instant unchanged across the action boundary at a
 * fixed `nowMs`. We derive before the reducer, apply it, derive after, and assert
 * equality — a reducer that forgets to re-anchor makes time jump, and this is the
 * test that catches it. It is parameterised over `setRate` / `setDirection` /
 * `pause` / `resume` from BOTH a live and a manual starting state.
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  setRate,
  setDirection,
  pause,
  resume,
  goLive,
} from '../../../src/state/time/timeSlice';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import type { TimeState } from '../../../src/@types/time/TimeState';

const liveStart: TimeState = {
  mode: 'live',
  anchor: { simDays: 2451545.0, realMs: 1_000 },
  rateIndex: 3,
  direction: 1,
  paused: false,
};

const manualStart: TimeState = {
  mode: 'manual',
  anchor: { simDays: 2460000.0, realMs: 5_000 },
  rateIndex: 5,
  direction: -1,
  paused: false,
};

const NOW_MS = 20_000;

const intents = [
  { name: 'setRate', action: setRate({ rateIndex: 6, nowMs: NOW_MS }) },
  { name: 'setDirection', action: setDirection({ direction: -1, nowMs: NOW_MS }) },
  { name: 'pause', action: pause({ nowMs: NOW_MS }) },
  { name: 'resume', action: resume({ nowMs: NOW_MS }) },
];

const starts = [
  { name: 'live', state: liveStart },
  { name: 'manual', state: manualStart },
];

describe('timeSlice re-anchor continuity', () => {
  for (const start of starts) {
    for (const intent of intents) {
      it(`${intent.name} from a ${start.name} start leaves derived simDays continuous`, () => {
        const before = deriveSimDays(start.state, NOW_MS);
        const next = reducer(start.state, intent.action);
        const after = deriveSimDays(next, NOW_MS);
        expect(after).toBeCloseTo(before, 9);
      });
    }
  }
});

describe('timeSlice pause holds, resume advances', () => {
  it('pause then resume at a later nowMs does not advance simDays while paused', () => {
    const manualForward: TimeState = {
      mode: 'manual',
      anchor: { simDays: 2460000.0, realMs: 0 },
      rateIndex: 3,
      direction: 1,
      paused: false,
    };

    const t0 = 1_000;
    const t1 = 5_000;
    const t2 = 9_000;

    const paused = reducer(manualForward, pause({ nowMs: t0 }));
    const pausedInstant = deriveSimDays(paused, t0);

    // While paused, a later nowMs cannot move the derived instant.
    expect(deriveSimDays(paused, t1)).toBeCloseTo(pausedInstant, 9);

    // Resume rebases realMs to t1; a still-later t2 then advances from the held value.
    const resumed = reducer(paused, resume({ nowMs: t1 }));
    expect(deriveSimDays(resumed, t2)).toBeGreaterThan(pausedInstant);
  });
});

describe('timeSlice goLive lands the ladder on the truthful detent', () => {
  it('resets rateIndex to 0 (1 s/s) so the displayed rate matches live wall time', () => {
    // Coming back from a fast manual detent, live mode advances at exactly 1 s/s
    // and ignores the ladder — so the detent must snap to index 0 or the toolbar
    // would keep reading the stale manual rate. This fails if goLive stops
    // touching rateIndex.
    const fastManual: TimeState = {
      mode: 'manual',
      anchor: { simDays: 2460000.0, realMs: 0 },
      rateIndex: 6,
      direction: -1,
      paused: true,
    };

    const next = reducer(fastManual, goLive({ simDays: 2451545.0, nowMs: 1_000 }));
    expect(next.rateIndex).toBe(0);
  });
});
