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
  setSimDays,
  restoreTime,
  startRide,
} from '../../../src/state/time/timeSlice';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { MISSION_EVENTS } from '../../../src/data/missions/missionEvents.generated';
import { missionEventMs } from '../../../src/utils/exhibits/timeline/missionEventMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import type { TimeState } from '../../../src/@types/time/TimeState';

const liveStart: TimeState = {
  mode: 'live',
  anchor: { simDays: 2451545.0, realMs: 1_000 },
  rateIndex: 3,
  direction: 1,
  paused: false,
  profile: null,
};

const manualStart: TimeState = {
  mode: 'manual',
  anchor: { simDays: 2460000.0, realMs: 5_000 },
  rateIndex: 5,
  direction: -1,
  paused: false,
  profile: null,
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
      profile: null,
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
      profile: null,
    };

    const next = reducer(fastManual, goLive({ simDays: 2451545.0, nowMs: 1_000 }));
    expect(next.rateIndex).toBe(0);
  });
});

describe('stepToMissionEvent', () => {
  it('lands a manual clock on the event instant, anchored at the action time', () => {
    const event = MISSION_EVENTS[3]!;
    const next = reducer(liveStart, stepToMissionEvent({ eventId: event.id, nowMs: 777 }));
    expect(next.mode).toBe('manual');
    expect(next.anchor).toEqual({
      simDays: unixMsToJulianDays(missionEventMs(event)),
      realMs: 777,
    });
  });
});

describe('ride profile', () => {
  const profile = {
    startWallMs: 0,
    wallMs: Float64Array.from([0, 10_000]),
    simDays: Float64Array.from([2460000, 2460010]),
  };
  const riding = reducer(manualStart, startRide({ profile: { ...profile, startWallMs: 50_000 } }));

  it('startRide un-pauses, anchors at the first sample and stamps the payload clock', () => {
    const paused = reducer(
      { ...manualStart, paused: true },
      startRide({ profile: { ...profile, startWallMs: 50_000 } }),
    );
    expect(paused.paused).toBe(false);
    expect(paused.profile?.startWallMs).toBe(50_000);
    expect(deriveSimDays(paused, 55_000)).toBe(2460005);
  });

  // Review focus 1: the clock freezes where the ride was, not at either end of the table.
  it('pause mid-ride freezes at the interpolated instant and drops the profile', () => {
    const next = reducer(riding, pause({ nowMs: 55_000 }));
    expect(next.profile).toBeNull();
    expect(next.paused).toBe(true);
    expect(deriveSimDays(next, 90_000)).toBe(2460005);
  });

  const visitorActions = [
    { name: 'setRate', action: setRate({ rateIndex: 4, nowMs: 55_000 }) },
    { name: 'setDirection', action: setDirection({ direction: -1, nowMs: 55_000 }) },
    { name: 'resume', action: resume({ nowMs: 55_000 }) },
    { name: 'setSimDays', action: setSimDays({ simDays: 2450000, nowMs: 55_000 }) },
    { name: 'goLive', action: goLive({ simDays: 2450000, nowMs: 55_000 }) },
    {
      name: 'restoreTime',
      action: restoreTime({ captured: manualStart, simDays: 2450000, nowMs: 55_000 }),
    },
    {
      name: 'stepToMissionEvent',
      action: stepToMissionEvent({ eventId: MISSION_EVENTS[3]!.id, nowMs: 55_000 }),
    },
  ];

  it.each(visitorActions)('$name drops the profile', ({ action }) => {
    expect(reducer(riding, action).profile).toBeNull();
  });

  it.each(visitorActions.slice(0, 3))('$name keeps the clock continuous mid-ride', ({ action }) => {
    expect(deriveSimDays(reducer(riding, action), 55_000)).toBe(2460005);
  });
});
