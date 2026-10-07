// @vitest-environment jsdom
//
// ExhibitTimelineContainer: the timeline shows one craft's chapters and event card, the tabs
// write the store's emphasis, and a chapter click seeks without pausing the clock.

import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import ExhibitTimelineContainer from '../../../src/components/containers/ExhibitTimelineContainer';
import { createTestStore } from '../../support/createTestStore';
import { selectTimeState } from '../../../src/state/time/selectors';
import { selectMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../../src/state/settings/core/orbitTrails/slice';
import { resume, setSimDays } from '../../../src/state/time/timeSlice';
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
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  render(<ExhibitTimelineContainer section={section} />, { wrapper });
  return store;
}

describe('ExhibitTimelineContainer', () => {
  it('lists Voyager 1 then Voyager 2, each with its authored route', () => {
    mount('1989-08-26');
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent(/Voyager 1.*Jupiter · Saturn · Titan/);
    expect(tabs[1]).toHaveTextContent(/Voyager 2.*Uranus · Neptune/);
  });

  it('shows only the selected craft: one card with its caption and measured distance', () => {
    mount('1989-08-26');
    const v1 = section.events.filter((e) => e.bodyId === 'voyager1');
    expect(screen.getAllByRole('listitem')).toHaveLength(v1.length);
    expect(screen.queryByText(section.captions['voyager2-neptune']!)).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    const neptune = section.events.find((e) => e.id === 'voyager2-neptune')!;
    expect(screen.getByText(section.captions['voyager2-neptune']!)).toBeInTheDocument();
    expect(
      screen.getByText(`${neptune.closestKm!.toLocaleString('en-US')} km from Neptune’s centre`),
    ).toBeInTheDocument();
  });

  it('a tab click sets the store emphasis and aria-selected follows it', () => {
    const store = mount('2026-01-01');
    expect(screen.getByRole('tab', { name: /Voyager 1/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Voyager 2/ }));
    expect(selectMissionEmphasis(store.getState())).toBe('voyager2');
    expect(screen.getByRole('tab', { name: /Voyager 2/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('a chapter click sets the clock to the event instant and leaves it running', () => {
    const store = mount('2026-01-01');
    const titanV1 = section.events.find((e) => e.id === 'voyager1-titan')!;
    fireEvent.click(screen.getByRole('button', { name: `${titanV1.label}, 1980-11-12` }));

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
});
