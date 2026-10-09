// @vitest-environment jsdom
//
// ExhibitTimelineContainer: the timeline shows one craft's event card and transport row, the tabs
// write the store's emphasis, and a dot click steps to its event.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import ExhibitTimelineContainer from '../../../src/components/containers/ExhibitTimelineContainer';
import { createTestStore } from '../../support/createTestStore';
import { selectTimeState } from '../../../src/state/time/selectors';
import { selectMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/slice';
import { MISSION_SPEEDS } from '../../../src/data/exhibits/mission/missionSpeeds';
import { playMission } from '../../../src/state/exhibits/playMission';
import { stepMissionSpeed } from '../../../src/state/exhibits/stepMissionSpeed';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { pause, resume, setSimDays, startMissionProfile } from '../../../src/state/time/timeSlice';
import { setMission } from '../../../src/state/camera/cameraSlice';
import type { CameraMission } from '../../../src/@types/camera/CameraMission';
import { voyager } from '../../../src/data/exhibits/voyager';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { ExhibitTimelineSection } from '../../../src/@types/exhibits/ExhibitTimelineSection';

const missionAt = (speedIndex: number): CameraMission => ({
  craftId: 'voyager1',
  stops: [],
  cruise: { yaw: 0, pitch: 0 },
  offsets: { yaw: 0, pitch: 0, zoom: 1 },
  speedIndex,
  retarget: 0,
});

const section = voyager.body.find((s): s is ExhibitTimelineSection => s.kind === 'timeline')!;

function mount(simIso: string) {
  const { store } = createTestStore();
  store.dispatch(
    setSimDays({ simDays: unixMsToJulianDays(Date.parse(simIso)), nowMs: performance.now() }),
  );
  // The exhibit's entry settings emphasise Voyager 1; the first lane alone would be Voyager 2.
  store.dispatch(setMissionEmphasis('voyager1'));
  store.dispatch(resume({ nowMs: performance.now() }));
  vi.spyOn(store, 'dispatch');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  render(<ExhibitTimelineContainer section={section} />, { wrapper });
  return store;
}

describe('ExhibitTimelineContainer', () => {
  it('lists Voyager 1 then Voyager 2 by name only', () => {
    mount('1989-08-26');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Voyager 1', 'Voyager 2']);
  });

  it('shows only the selected craft: its current event, date and name', () => {
    mount('1989-08-26');
    expect(screen.queryByText('Neptune')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    expect(screen.getByText('Neptune')).toBeInTheDocument();
    expect(screen.getByText('25 Aug 1989')).toBeInTheDocument();
    expect(screen.getByText('26 Aug 1989')).toBeInTheDocument();
  });

  it('run / pause and the speed pair dispatch the clock and mission actions', () => {
    const store = mount('1989-08-26');
    const spy = vi.mocked(store.dispatch);
    const types = () => spy.mock.calls.map((c) => (c[0] as { type: string }).type);
    spy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Pause the clock' }));
    expect(types()).toEqual([pause.type]);
    fireEvent.click(screen.getByRole('button', { name: 'Run the clock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    fireEvent.click(screen.getByRole('button', { name: 'Slower' }));
    expect(types()).toEqual([
      pause.type,
      playMission.type,
      stepMissionSpeed.type,
      stepMissionSpeed.type,
    ]);
  });

  it('a tab click sets the store emphasis and aria-selected follows it', () => {
    const store = mount('2026-01-01');
    expect(screen.getByRole('tab', { name: /Voyager 1/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    expect(selectMissionEmphasis(store.getState())).toBe('voyager2');
    expect(screen.getByRole('tab', { name: /Voyager 2/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('an event dot click steps to the event, a flyby two days early', () => {
    const store = mount('2026-01-01');
    const titanV1 = section.events.find((e) => e.id === 'voyager1-titan')!;
    fireEvent.click(screen.getAllByTitle(`${titanV1.label} · 1980-11-12`).at(-1)!);

    const time = selectTimeState(store.getState());
    expect(time.anchor.simDays).toBeCloseTo(unixMsToJulianDays(Date.parse(titanV1.iso)) - 2, 9);
    expect(deriveSimDays(time, time.anchor.realMs)).toBe(time.anchor.simDays);
  });

  it('Previous / Next step the selected craft only and disable at the ends', () => {
    const store = mount('1977-08-01');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    // No "not launched" state: the launch stands in for any earlier instant.
    expect(screen.getByText('Launch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    const firstV1 = section.events.find((e) => e.bodyId === 'voyager1')!;
    const time = selectTimeState(store.getState());
    expect(time.anchor.simDays).toBeCloseTo(unixMsToJulianDays(Date.parse(firstV1.iso)), 9);
  });

  it('every event step dispatches stepToMissionEvent; a track drag dispatches setSimDays only', () => {
    const store = mount('1977-08-01');
    const spy = vi.mocked(store.dispatch);
    spy.mockClear();
    const v1 = section.events.filter((e) => e.bodyId === 'voyager1');
    const stepped = () =>
      spy.mock.calls.map((c) => c[0] as { type: string; payload?: { eventId?: string } });

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    // The track dot is aria-hidden (Previous / Next are the accessible twin) but still clickable.
    const dot = screen.getAllByTitle(new RegExp(`^${v1[3]!.label} · `)).at(-1)!;
    fireEvent.click(dot);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageDown' });
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    const steps = stepped().filter((a) => a.type === stepToMissionEvent.type);
    expect(steps.map((a) => a.payload!.eventId)).toEqual([
      v1[0]!.id,
      v1[3]!.id,
      expect.any(String),
      expect.any(String),
    ]);

    spy.mockClear();
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    slider.setPointerCapture = () => {};
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(stepped().map((a) => a.type)).toEqual([setSimDays.type]);
  });

  it('paused, the rate slot reads the speed factor from the store; the ends disable', () => {
    const store = mount('1989-08-26');
    act(() => {
      store.dispatch(pause({ nowMs: performance.now() }));
      store.dispatch(setMission(missionAt(MISSION_SPEEDS.indexOf(1))));
    });
    expect(screen.getByText('1×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slower' })).toBeEnabled();
    act(() => {
      store.dispatch(setMission(missionAt(0)));
    });
    expect(screen.getByText('1⁄16×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slower' })).toBeDisabled();
    act(() => {
      store.dispatch(setMission(missionAt(MISSION_SPEEDS.length - 1)));
    });
    expect(screen.getByText('4×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Faster' })).toBeDisabled();
  });

  it('reads a playing profile’s live speed, with the time of day under a day per second', () => {
    const store = mount('1989-08-24');
    const start = performance.now();
    act(() => {
      store.dispatch(setMission(missionAt(MISSION_SPEEDS.length - 1)));
      store.dispatch(
        startMissionProfile({
          profile: {
            startWallMs: start,
            // One sim hour per wall second for a minute.
            wallMs: Float64Array.of(0, 60_000),
            simDays: Float64Array.of(2447762, 2447762 + 60 / 24),
            speedIndex: MISSION_SPEEDS.length - 1,
          },
        }),
      );
    });
    expect(screen.getByText('1.0 h/s')).toBeInTheDocument();
    expect(screen.getByText(/^\d\d:\d\d UT$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Faster' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Slower' })).toBeEnabled();
  });
});
