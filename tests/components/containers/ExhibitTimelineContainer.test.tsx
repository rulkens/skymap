// @vitest-environment jsdom
//
// ExhibitTimelineContainer: the timeline shows one craft's event card and transport row, the tabs
// write the store's emphasis, and a dot click seeks without pausing the clock.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import ExhibitTimelineContainer from '../../../src/components/containers/ExhibitTimelineContainer';
import { createTestStore } from '../../support/createTestStore';
import { selectTimeState } from '../../../src/state/time/selectors';
import { selectMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/slice';
import { setRide } from '../../../src/state/camera/cameraSlice';
import { showWholeMission } from '../../../src/state/exhibits/showWholeMission';
import { stepToMissionEvent } from '../../../src/state/exhibits/stepToMissionEvent';
import { pause, resume, setRate, setSimDays } from '../../../src/state/time/timeSlice';
import { voyager } from '../../../src/data/exhibits/voyager';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { ExhibitTimelineSection } from '../../../src/@types/exhibits/ExhibitTimelineSection';

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

  it('run / pause and the rate pair dispatch the time actions', () => {
    const store = mount('1989-08-26');
    const spy = vi.mocked(store.dispatch);
    const types = () => spy.mock.calls.map((c) => (c[0] as { type: string }).type);
    spy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Pause the clock' }));
    expect(types()).toEqual([pause.type]);
    fireEvent.click(screen.getByRole('button', { name: 'Run the clock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    fireEvent.click(screen.getByRole('button', { name: 'Slower' }));
    expect(types()).toEqual([pause.type, resume.type, setRate.type, setRate.type]);
  });

  it('a tab click sets the store emphasis and aria-selected follows it', () => {
    const store = mount('2026-01-01');
    expect(screen.getByRole('tab', { name: /Voyager 1/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    expect(selectMissionEmphasis(store.getState())).toBe('voyager2');
    expect(screen.getByRole('tab', { name: /Voyager 2/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('an event dot click sets the clock to the event instant and leaves it running', () => {
    const store = mount('2026-01-01');
    const titanV1 = section.events.find((e) => e.id === 'voyager1-titan')!;
    fireEvent.click(screen.getAllByTitle(`${titanV1.label} · 1980-11-12`).at(-1)!);

    const time = selectTimeState(store.getState());
    expect(time.paused).toBe(false);
    expect(time.anchor.simDays).toBeCloseTo(unixMsToJulianDays(Date.parse(titanV1.iso)), 9);
    expect(deriveSimDays(time, time.anchor.realMs)).toBe(time.anchor.simDays);
  });

  it('Previous / Next step the selected craft only and disable at the ends', () => {
    const store = mount('1977-08-01');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    expect(screen.getByText(/has not launched yet/)).toBeInTheDocument();
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

  it('offers Whole mission and the riding line only while a ride is set', () => {
    const store = mount('1989-08-26');
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    expect(screen.queryByRole('button', { name: 'Whole mission' })).toBeNull();

    act(() => {
      store.dispatch(
        setRide({
          eventId: 'voyager2-neptune',
          craftId: 'voyager2',
          targetId: 'neptune',
          closestKm: 29236,
          normal: [0, 0, 1],
          offsets: { yaw: 0, pitch: 0, zoom: 1 },
        }),
      );
    });
    expect(screen.getByText(/Riding along with Voyager 2 past Neptune/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Whole mission' }));
    expect(store.dispatch).toHaveBeenCalledWith(showWholeMission());
  });

  it('keys the card, riding line and Next off the ridden event while the clock is still before it', () => {
    const store = mount('1989-08-23');
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    const v2 = section.events.filter((e) => e.bodyId === 'voyager2');
    const at = v2.findIndex((e) => e.id === 'voyager2-neptune');
    act(() => {
      store.dispatch(
        setRide({
          eventId: 'voyager2-neptune',
          craftId: 'voyager2',
          targetId: 'neptune',
          closestKm: 29236,
          normal: [0, 0, 1],
          offsets: { yaw: 0, pitch: 0, zoom: 1 },
        }),
      );
    });
    expect(screen.getByText(/Riding along with Voyager 2 past Neptune/)).toBeInTheDocument();
    vi.mocked(store.dispatch).mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(store.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ eventId: v2[at - 1]!.id }) }),
    );
  });
});
