// @vitest-environment jsdom
//
// VoyageContainer: the overlay's controls write the voyage cluster and the clock; a scrub on the
// ship-time track lands the Earth clock at launch + t(τ).

import { describe, it, expect, vi } from 'vitest';
import { act, render, fireEvent, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import VoyageContainer from '../../../../src/layers/voyage/ui/VoyageContainer';
import { createTestStore } from '../../../support/createTestStore';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { JULIAN_YEAR_DAYS } from '../../../../src/data/time/julianYearDays';
import { VOYAGE_DESTINATIONS } from '../../../../src/data/voyage/voyageDestinations';
import { playVoyage } from '../../../../src/layers/voyage/exhibits/playVoyage';
import {
  setVoyageDestination,
  setVoyageHeadlight,
  setVoyageLaunchDays,
} from '../../../../src/layers/voyage/state/voyage/slice';
import { openExhibit } from '../../../../src/state/exhibits/exhibitActions';
import { pause, setSimDays } from '../../../../src/state/time/timeSlice';
import { earthYrOfTau } from '../../../../src/utils/relativity/earthYrOfTau';
import { tripOf } from '../../../../src/utils/relativity/tripOf';
import { voyageTripLy } from '../../../../src/utils/voyage/voyageTripLy';

const M31_LY = voyageTripLy(VOYAGE_DESTINATIONS.m31);

function mount() {
  const { store } = createTestStore();
  const nowMs = performance.now();
  store.dispatch(setVoyageDestination('m31'));
  store.dispatch(setVoyageLaunchDays(CONST_J2000));
  store.dispatch(setSimDays({ simDays: CONST_J2000, nowMs }));
  store.dispatch(pause({ nowMs }));
  vi.spyOn(store, 'dispatch');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  render(<VoyageContainer data={{ heading: 'Voyage' }} />, { wrapper });
  return store;
}

const types = (store: ReturnType<typeof mount>) =>
  vi.mocked(store.dispatch).mock.calls.map((c) => (c[0] as { type: string }).type);

describe('VoyageContainer', () => {
  it('labels both clocks', () => {
    mount();
    expect(screen.getByText('Ship’s clock')).toBeInTheDocument();
    expect(screen.getByText('Earth’s clock')).toBeInTheDocument();
  });

  it('a track scrub dispatches setSimDays at launch + earthYrOfTau', () => {
    const store = mount();
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    slider.setPointerCapture = () => {};
    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    const tauHalf = tripOf(M31_LY).tauTotalYr / 2;
    const want = CONST_J2000 + earthYrOfTau(M31_LY, tauHalf) * JULIAN_YEAR_DAYS;
    expect(store.getState().time.anchor.simDays).toBeCloseTo(want, 3);
    expect(types(store)).toEqual([setSimDays.type]);
  });

  it('run dispatches playVoyage', () => {
    const store = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Run the clock' }));
    expect(types(store)).toEqual([playVoyage.type]);
  });

  it('a tab opens the sibling exhibit on a cut', () => {
    const store = mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Proxima Centauri' }));
    expect(store.dispatch).toHaveBeenCalledWith(
      openExhibit({ id: 'voyage-proxima', entry: 'cut' }),
    );
  });

  it('the headlight toggle restores the last non-zero k', () => {
    const store = mount();
    act(() => {
      store.dispatch(setVoyageHeadlight(2.5));
    });
    const headlight = () => screen.getByRole('switch', { name: /Headlight/ });
    fireEvent.click(headlight());
    expect(store.getState().settings.voyage.headlight).toBe(0);
    expect(headlight()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(headlight());
    expect(store.getState().settings.voyage.headlight).toBe(2.5);
  });
});
