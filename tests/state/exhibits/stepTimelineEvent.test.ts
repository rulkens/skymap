import { describe, it, expect } from 'vitest';

import { stepTimelineEvent } from '../../../src/state/exhibits/stepTimelineEvent';
import { KEYBOARD_SHORTCUTS, SHORTCUTS_BY_KEY } from '../../../src/state/input/keyboardShortcuts';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { MISSION_EVENTS } from '../../../src/data/missions/missionEvents.generated';
import { missionEventMs } from '../../../src/utils/exhibits/timeline/missionEventMs';
import { missionEventStepMs } from '../../../src/utils/exhibits/timeline/missionEventStepMs';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { RootState } from '../../../src/store/types';

const SAVED = MISSION_EVENTS;
const stateAt = (
  iso: string,
  exhibit: 'voyager' | 'solarSystem' | null,
  emphasis: string | null = null,
): RootState =>
  ({
    settings: { orbitTrails: { enabled: true, emphasis } },
    takeover: { active: exhibit ? { kind: 'exhibit', id: exhibit, entry: 'cut' } : null },
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
    type: stepToMissionEvent.type,
    payload: expect.objectContaining({ eventId: e.id }),
  });

describe('stepTimelineEvent', () => {
  it('steps to the next and previous event relative to the current sim day', () => {
    const state = stateAt('1980-01-01', 'voyager');
    const before = SAVED.filter((e) => missionEventMs(e) < Date.parse('1980-01-01')).at(-1)!;
    const after = SAVED.find((e) => missionEventMs(e) > Date.parse('1980-01-01'))!;
    expect(stepTimelineEvent(state, 1)).toEqual(stepsTo(after));
    expect(stepTimelineEvent(state, -1)).toEqual(stepsTo(before));
  });

  it('steps past an event the clock already sits on', () => {
    const second = SAVED[1]!;
    const state = stateAt(second.iso, 'voyager');
    expect(stepTimelineEvent(state, -1)).toEqual(stepsTo(SAVED[0]!));
    expect(stepTimelineEvent(state, 1)).toEqual(stepsTo(SAVED[2]!));
  });

  it('does nothing at the ends, or outside a timeline exhibit', () => {
    expect(stepTimelineEvent(stateAt(SAVED[0]!.iso, 'voyager'), -1)).toBeNull();
    expect(stepTimelineEvent(stateAt(SAVED.at(-1)!.iso, 'voyager'), 1)).toBeNull();
    expect(stepTimelineEvent(stateAt('1980-01-01', 'solarSystem'), 1)).toBeNull();
    expect(stepTimelineEvent(stateAt('1980-01-01', null), 1)).toBeNull();
  });
});

describe('stepTimelineEvent with a craft emphasised', () => {
  it("steps only through that craft's events", () => {
    const v2 = SAVED.filter((e) => e.bodyId === 'voyager2');
    // Where a step to Jupiter lands: two days before closest approach.
    const state = stateAt(
      new Date(missionEventStepMs(v2[1]!)).toISOString(),
      'voyager',
      'voyager2',
    );
    expect(stepTimelineEvent(state, 1)).toEqual(stepsTo(v2[2]!));
    expect(stepTimelineEvent(state, -1)).toEqual(stepsTo(v2[0]!));
    expect(stepTimelineEvent(stateAt(v2.at(-1)!.iso, 'voyager', 'voyager2'), 1)).toBeNull();
  });
});

describe('stepTimelineEvent from a flyby step', () => {
  const rewound = (event: (typeof SAVED)[number], emphasis: string) => {
    const state = stateAt(event.iso, 'voyager', emphasis);
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
    expect(stepTimelineEvent(state, -1)).toEqual(stepsTo(v2[at - 1]!));
    expect(stepTimelineEvent(state, 1)).toEqual(stepsTo(v2[at + 1]!));
  });

  it('steps from Saturn to the next stop, not back onto Titan 18 h before it', () => {
    const v1 = SAVED.filter((e) => e.bodyId === 'voyager1');
    const saturn = v1.findIndex((e) => e.id === 'voyager1-saturn');
    const state = rewound(v1[saturn]!, 'voyager1') as RootState;
    expect(stepTimelineEvent(state, 1)).toEqual(stepsTo(v1[saturn + 1]!));
    expect(stepTimelineEvent(state, -1)).toEqual(stepsTo(v1[saturn - 1]!));
  });
});

describe('the , and . shortcuts', () => {
  it('are registered and routable by the key hotkeys-js reports', () => {
    for (const key of [',', '.']) {
      const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.keys === key);
      expect(shortcut).toBeDefined();
      expect(SHORTCUTS_BY_KEY[key]).toBe(shortcut);
    }
  });
});
