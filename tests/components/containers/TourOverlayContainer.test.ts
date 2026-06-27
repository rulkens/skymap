// @vitest-environment jsdom

/**
 * TourOverlayContainer — verify the container resolves the active beat's readout
 * from a seeded `tour` slice and turns each nav control into the matching tour
 * signal dispatch.
 *
 * The four controls dispatch reducer-less signals (`prevBeat` / `advanceTour` /
 * `togglePause` / `exitTour`) that only the tour sagas act on — so state does
 * not change on click. We assert the dispatch directly via a `store.dispatch`
 * spy installed AFTER seeding (so the seed dispatches are excluded) and BEFORE
 * render (so `useAppDispatch` hands the component the spy).
 *
 * Pattern: store-backed via `createAppStore()` + `<Provider>`, `createElement`
 * (no JSX — matches the `tests/**\/*.test.ts` glob), mirroring
 * `AutoRotateToggleContainer.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import TourOverlayContainer from '../../../src/components/containers/TourOverlayContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { tourStarted, beatChanged } from '../../../src/state/tour/tourSlice';
import { prevBeat, advanceTour, togglePause, exitTour } from '../../../src/state/tour/tourActions';

type Store = ReturnType<typeof createAppStore>['store'];

function makeWrapper(store: Store) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

// Seed an active tour parked on beat index 1, so `canPrev` is true and every
// nav button is enabled. `webShowcase` is a real registry tour (3 beats).
function seedActiveTour(store: Store): void {
  store.dispatch(tourStarted({ tourId: 'webShowcase' }));
  store.dispatch(beatChanged(1));
}

function renderContainer(store: Store) {
  return render(createElement(TourOverlayContainer), { wrapper: makeWrapper(store) });
}

describe('TourOverlayContainer', () => {
  it('renders the always-on nav controls while a tour is active', () => {
    const { store } = createAppStore();
    seedActiveTour(store);
    const { container } = renderContainer(store);
    expect(container.querySelector('[aria-label="Next beat"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Previous beat"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Exit tour"]')).not.toBeNull();
  });

  it('dispatches advanceTour when Next is clicked', () => {
    const { store } = createAppStore();
    seedActiveTour(store);
    const spy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    fireEvent.click(container.querySelector('[aria-label="Next beat"]')!);
    expect(spy).toHaveBeenCalledWith(advanceTour());
  });

  it('dispatches prevBeat when Previous is clicked (enabled at index > 0)', () => {
    const { store } = createAppStore();
    seedActiveTour(store);
    const spy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    const prev = container.querySelector('[aria-label="Previous beat"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(false);
    fireEvent.click(prev);
    expect(spy).toHaveBeenCalledWith(prevBeat());
  });

  it('dispatches togglePause when the pause control is clicked', () => {
    const { store } = createAppStore();
    seedActiveTour(store);
    const spy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    fireEvent.click(container.querySelector('[aria-label="Pause"]')!);
    expect(spy).toHaveBeenCalledWith(togglePause());
  });

  it('dispatches exitTour when Exit is clicked', () => {
    const { store } = createAppStore();
    seedActiveTour(store);
    const spy = vi.spyOn(store, 'dispatch');
    const { container } = renderContainer(store);
    fireEvent.click(container.querySelector('[aria-label="Exit tour"]')!);
    expect(spy).toHaveBeenCalledWith(exitTour());
  });

  it('disables Previous on the first beat (canPrev false at index 0)', () => {
    const { store } = createAppStore();
    store.dispatch(tourStarted({ tourId: 'webShowcase' })); // index 0, no beatChanged
    const { container } = renderContainer(store);
    const prev = container.querySelector('[aria-label="Previous beat"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });
});
