// @vitest-environment jsdom
//
// ExhibitTimelineContainer: the timeline renders its events with their captions, and a row
// click sets the clock to the event instant without pausing it.

import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import ExhibitTimelineContainer from '../../../src/components/containers/ExhibitTimelineContainer';
import { createTestStore } from '../../support/createTestStore';
import { selectTimeState } from '../../../src/state/time/selectors';
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
  store.dispatch(resume({ nowMs: performance.now() }));
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  render(<ExhibitTimelineContainer section={section} />, { wrapper });
  return store;
}

describe('ExhibitTimelineContainer', () => {
  it('lists every event, and expands the current one with its caption and measured distance', () => {
    mount('1989-08-26');
    expect(screen.getAllByRole('button')).toHaveLength(section.events.length);
    expect(screen.getByText(section.captions['voyager2-neptune']!)).toBeInTheDocument();
    const neptune = section.events.find((e) => e.id === 'voyager2-neptune')!;
    expect(
      screen.getByText(`${neptune.closestKm!.toLocaleString('en-US')} km from Neptune’s centre`),
    ).toBeInTheDocument();
    expect(screen.queryByText(section.captions['voyager1-saturn']!)).toBeNull();
  });

  it('a row click sets the clock to the event instant and leaves it running', () => {
    const store = mount('2026-01-01');
    const row = screen.getAllByText('1980-11-12')[0]!.closest('button')!;
    const titanV1 = section.events.find((e) => e.id === 'voyager1-titan')!;
    fireEvent.click(row);

    const time = selectTimeState(store.getState());
    expect(time.paused).toBe(false);
    expect(time.anchor.simDays).toBeCloseTo(unixMsToJulianDays(Date.parse(titanV1.iso)), 9);
    expect(deriveSimDays(time, time.anchor.realMs)).toBe(time.anchor.simDays);
  });
});
