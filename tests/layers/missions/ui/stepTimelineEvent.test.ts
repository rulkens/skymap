import { describe, it, expect } from 'vitest';

import { stepTimelineEvent } from '../../../../src/layers/missions/ui/stepTimelineEvent';
import { missionTimelineKind } from '../../../../src/layers/missions/exhibits/timeline/missionTimelineKind';
import { voyagerTimeline } from '../../../helpers/missions/voyagerTimeline';
import { stepToEvent } from '../../../../src/state/time/timeSlice';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { missionEventMs } from '../../../../src/utils/exhibits/timeline/missionEventMs';
import { missionEventStepMs } from '../../../../src/utils/exhibits/timeline/missionEventStepMs';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import type { RootState } from '../../../../src/store/types';

const SAVED = MISSION_EVENTS;
const TIMELINE = voyagerTimeline();
const V1 = SAVED.filter((e) => e.bodyId === 'voyager1');
const stateAt = (iso: string, craft: string | null = 'voyager1'): RootState =>
  ({
    settings: { missions: { trails: true, craft } },
    time: {
      mode: 'manual',
      anchor: { simDays: unixMsToJulianDays(Date.parse(iso)), realMs: 0 },
      rateIndex: 0,
      direction: 1,
      paused: true,
      profile: null,
    },
  }) as unknown as RootState;

const stepsTo = (e: { id: string }) =>
  expect.objectContaining({
    type: stepToEvent.type,
    payload: expect.objectContaining({ eventId: e.id }),
  });

describe('stepTimelineEvent', () => {
  it('steps to the next and previous event relative to the current sim day', () => {
    const state = stateAt('1980-01-01');
    const before = V1.filter((e) => missionEventMs(e) < Date.parse('1980-01-01')).at(-1)!;
    const after = V1.find((e) => missionEventMs(e) > Date.parse('1980-01-01'))!;
    expect(stepTimelineEvent(state, TIMELINE, 1)).toEqual(stepsTo(after));
    expect(stepTimelineEvent(state, TIMELINE, -1)).toEqual(stepsTo(before));
  });

  it('steps past an event the clock already sits on', () => {
    const k = V1.findIndex((e, i) => i > 0 && e.kind !== 'flyby');
    const state = stateAt(V1[k]!.iso);
    expect(stepTimelineEvent(state, TIMELINE, -1)).toEqual(stepsTo(V1[k - 1]!));
    expect(stepTimelineEvent(state, TIMELINE, 1)).toEqual(stepsTo(V1[k + 1]!));
  });

  it('does nothing at the ends', () => {
    expect(stepTimelineEvent(stateAt(V1[0]!.iso), TIMELINE, -1)).toBeNull();
    expect(stepTimelineEvent(stateAt(V1.at(-1)!.iso), TIMELINE, 1)).toBeNull();
  });
});

describe('stepTimelineEvent lands the clock', () => {
  it.each([
    ['voyager1', 'voyager1-pale-blue-dot', 0],
    ['voyager2', 'voyager2-neptune', 2],
  ])('%s: on %s, %i d early', (craft, id, leadDays) => {
    const events = SAVED.filter((e) => e.bodyId === craft);
    const i = events.findIndex((e) => e.id === id);
    const from = new Date(missionEventStepMs(events[i - 1]!)).toISOString();
    const action = stepTimelineEvent(stateAt(from, craft), TIMELINE, 1)!;
    expect(action.payload.eventId).toBe(id);
    expect(action.payload.simDays).toBeCloseTo(
      unixMsToJulianDays(missionEventMs(events[i]!)) - leadDays,
      9,
    );
  });
});

describe('stepTimelineEvent with a craft selected', () => {
  it("steps only through that craft's events", () => {
    const v2 = SAVED.filter((e) => e.bodyId === 'voyager2');
    // Where a step to Jupiter lands: two days before closest approach.
    const state = stateAt(new Date(missionEventStepMs(v2[1]!)).toISOString(), 'voyager2');
    expect(stepTimelineEvent(state, TIMELINE, 1)).toEqual(stepsTo(v2[2]!));
    expect(stepTimelineEvent(state, TIMELINE, -1)).toEqual(stepsTo(v2[0]!));
    expect(stepTimelineEvent(stateAt(v2.at(-1)!.iso, 'voyager2'), TIMELINE, 1)).toBeNull();
  });
});

describe('stepTimelineEvent from a flyby step', () => {
  const rewound = (event: (typeof SAVED)[number], craft: string) => {
    const state = stateAt(event.iso, craft);
    const { anchor } = state.time;
    return {
      ...state,
      time: { ...state.time, anchor: { ...anchor, simDays: anchor.simDays - 2 } },
    };
  };

  it('steps from the flyby itself though the clock sits two days before it', () => {
    const v2 = SAVED.filter((e) => e.bodyId === 'voyager2');
    const at = v2.findIndex((e) => e.id === 'voyager2-neptune');
    const state = rewound(v2[at]!, 'voyager2') as RootState;
    expect(stepTimelineEvent(state, TIMELINE, -1)).toEqual(stepsTo(v2[at - 1]!));
    expect(stepTimelineEvent(state, TIMELINE, 1)).toEqual(stepsTo(v2[at + 1]!));
  });

  it('steps from Saturn to the next stop, not back onto Titan 18 h before it', () => {
    const v1 = SAVED.filter((e) => e.bodyId === 'voyager1');
    const saturn = v1.findIndex((e) => e.id === 'voyager1-saturn');
    const state = rewound(v1[saturn]!, 'voyager1') as RootState;
    expect(stepTimelineEvent(state, TIMELINE, 1)).toEqual(stepsTo(v1[saturn + 1]!));
    expect(stepTimelineEvent(state, TIMELINE, -1)).toEqual(stepsTo(v1[saturn - 1]!));
  });
});

describe('the , and . shortcuts', () => {
  it('ride the timeline kind and step with its data', () => {
    const state = stateAt('1980-01-01');
    const after = V1.find((e) => missionEventMs(e) > Date.parse('1980-01-01'))!;
    const dot = missionTimelineKind.shortcuts!.find((s) => s.keys === '.')!;
    expect(dot.run(state, TIMELINE)).toEqual(stepsTo(after));
  });
});
