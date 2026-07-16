// @vitest-environment jsdom

/**
 * StarsSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * The container takes no props; `createElement(StarsSectionContainer, null)`
 * is the correct form.
 *
 * Tests assert:
 *  - Toggling the section master checkbox dispatches `setStarCatalogEnabled`,
 *    so `selectStarCatalogs(store.getState()).enabled` flips. The master is a
 *    real gate (unlike the Galaxies master, which is a per-source fan-out) —
 *    the `starCatalogs.enabled` field landed in Task 5.
 *  - Toggling the `gaiaStars` per-catalog row dispatches `setStarCatalogVisible`
 *    with `id: 'gaiaStars'`, so `starCatalogs.items.gaiaStars.enabled` clears.
 *  - The Advanced star-size slider reflects the seeded `starCatalogs.sizePx`,
 *    and moving it dispatches `setStarCatalogSize`, so
 *    `selectStarCatalogSize(store.getState())` reflects the new value.
 *  - The Advanced star-brightness slider reflects the seeded
 *    `starCatalogs.brightness`, and moving it dispatches
 *    `setStarCatalogBrightness`, so `selectStarCatalogBrightness(store.getState())`
 *    reflects the new value.
 *
 * Why assert on `store.getState()` rather than re-reading the DOM: RTK
 * `dispatch` is synchronous, so the store reflects the new value immediately —
 * the canonical "did the action land?" check.
 *
 * `fireEvent.click` (not `.change`) is the reliable trigger for React-controlled
 * checkboxes in jsdom — `fireEvent.change` does not update `e.target.checked`.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import StarsSectionContainer from '../../../src/components/containers/StarsSectionContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectStarCatalogs,
  selectStarCatalogSize,
  selectStarCatalogBrightness,
  selectStarCatalogRefineThreshold,
  selectStarCatalogGlowOverlap,
  selectStarCatalogExposureNearX,
  selectStarCatalogExposureMidX,
  selectStarCatalogExposureFarX,
} from '../../../src/state/settings/selectors';
import {
  setStarCatalogSize,
  setStarCatalogBrightness,
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureMidX,
  setStarCatalogExposureFarX,
} from '../../../src/state/settings/settingsSlice';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('StarsSectionContainer', () => {
  it('dispatches setStarCatalogEnabled and flips the master gate when the header master is toggled', () => {
    const { store } = createAppStore();
    // Star catalogs start enabled (gate on) in the default store state.
    expect(selectStarCatalogs(store.getState()).enabled).toBe(true);

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // The master toggle is the first checkbox in the CollapsibleSection header.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.checked).toBe(true);
    fireEvent.click(headerCheckbox);

    expect(selectStarCatalogs(store.getState()).enabled).toBe(false);
  });

  it('dispatches setStarCatalogVisible and clears items.gaiaStars.enabled when the row is toggled', () => {
    const { store } = createAppStore();
    // gaiaStars starts visible in the default store state.
    expect(selectStarCatalogs(store.getState()).items.gaiaStars.enabled).toBe(true);

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const gaiaCheckbox = container.querySelector<HTMLInputElement>(
      '#toggle-star-catalog-gaiaStars',
    );
    expect(gaiaCheckbox).not.toBeNull();
    expect(gaiaCheckbox!.checked).toBe(true);

    fireEvent.click(gaiaCheckbox!);

    expect(selectStarCatalogs(store.getState()).items.gaiaStars.enabled).toBe(false);
  });

  it('reflects seeded sizePx in the star-size slider value', () => {
    // Dispatch a non-default size before rendering so the slider must read from
    // the store rather than a hard-coded default.
    const { store } = createAppStore();
    store.dispatch(setStarCatalogSize(6.0));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-size');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('6');
  });

  it('dispatches setStarCatalogSize and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-size')!;
    fireEvent.change(slider, { target: { value: '5.2' } });

    expect(selectStarCatalogSize(store.getState())).toBeCloseTo(5.2);
  });

  it('reflects seeded brightness in the star-brightness slider value', () => {
    // Dispatch a non-default brightness before rendering so the slider must read
    // from the store rather than a hard-coded default.
    const { store } = createAppStore();
    store.dispatch(setStarCatalogBrightness(2.0));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-brightness');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('2');
  });

  it('dispatches setStarCatalogBrightness and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-brightness')!;
    fireEvent.change(slider, { target: { value: '0.6' } });

    expect(selectStarCatalogBrightness(store.getState())).toBeCloseTo(0.6);
  });

  it('reflects seeded refineThreshold in the Detail slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogRefineThreshold(0.12));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-detail');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('0.12');
  });

  it('dispatches setStarCatalogRefineThreshold and updates the store when the Detail slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-detail')!;
    fireEvent.change(slider, { target: { value: '0.03' } });

    expect(selectStarCatalogRefineThreshold(store.getState())).toBeCloseTo(0.03);
  });

  it('reflects seeded glowOverlap in the glow-overlap slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogGlowOverlap(1.8));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-glow-overlap');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('1.8');
  });

  it('dispatches setStarCatalogGlowOverlap and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-glow-overlap')!;
    fireEvent.change(slider, { target: { value: '2.2' } });

    expect(selectStarCatalogGlowOverlap(store.getState())).toBeCloseTo(2.2);
  });

  it('reflects seeded exposureNearX in the Exposure (near) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureNearX(30));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-near');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('30');
  });

  it('dispatches setStarCatalogExposureNearX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-near')!;
    fireEvent.change(slider, { target: { value: '22.5' } });

    expect(selectStarCatalogExposureNearX(store.getState())).toBeCloseTo(22.5);
  });

  it('reflects seeded exposureMidX in the Exposure (mid) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureMidX(40));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-mid');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('40');
  });

  it('dispatches setStarCatalogExposureMidX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-mid')!;
    fireEvent.change(slider, { target: { value: '33' } });

    expect(selectStarCatalogExposureMidX(store.getState())).toBeCloseTo(33);
  });

  it('reflects seeded exposureFarX in the Exposure (far) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureFarX(120));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-far');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('120');
  });

  it('dispatches setStarCatalogExposureFarX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-star-exposure-far')!;
    fireEvent.change(slider, { target: { value: '140' } });

    expect(selectStarCatalogExposureFarX(store.getState())).toBeCloseTo(140);
  });
});
