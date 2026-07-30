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
import { createTestStore as createAppStore } from '../../support/createTestStore';
import {
  selectStarCatalogs,
  selectStarCatalogSize,
  selectStarCatalogBrightness,
  selectStarCatalogRefineThreshold,
  selectStarCatalogGlowOverlap,
  selectStarCatalogExposureNearX,
  selectStarCatalogExposureMidX,
  selectStarCatalogExposureFarX,
  selectStarCatalogAggregateIntensityCap,
} from '../../../src/state/settings/selectors';
import {
  setStarCatalogSize,
  setStarCatalogBrightness,
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureMidX,
  setStarCatalogExposureFarX,
  setStarCatalogAggregateIntensityCap,
} from '../../../src/state/settings/settingsSlice';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

/**
 * The compact `Slider` renders `role="slider"` + `aria-label`/`aria-valuenow`
 * instead of a native `<input type=range>` — several live in this container, so
 * we pick by label. A raw DOM query reaches them even though the Advanced body
 * is aria-hidden until expanded (jsdom `querySelectorAll` ignores that), and a
 * keyboard ArrowRight is the deterministic drive (pointer math needs a layout
 * rect jsdom doesn't provide).
 */
function sliderByLabel(container: HTMLElement, label: string): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]')).find(
    (s) => s.getAttribute('aria-label') === label,
  );
  if (!el) throw new Error(`no slider with aria-label "${label}"`);
  return el;
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

  it('toggles the famous-star map through its own catalog row, leaving the survey row alone', () => {
    // The curated map is a star-catalog row like any other, so it renders from
    // the same loop and writes to its own `items` entry. The isolation is the
    // claim worth pinning: the two rows share a cluster and a reducer, and a
    // mis-keyed dispatch would flip the wrong catalog with no type error.
    const { store } = createAppStore();

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const toggle = container.querySelector<HTMLInputElement>('#toggle-star-catalog-famousStar');
    expect(toggle).not.toBeNull();
    expect(toggle!.checked).toBe(true);

    fireEvent.click(toggle!);

    const items = selectStarCatalogs(store.getState()).items;
    expect(items.famousStar.enabled).toBe(false);
    expect(items.gaiaStars.enabled).toBe(true);
  });

  it('reflects seeded sizePx in the star-size slider value', () => {
    // Dispatch a non-default size before rendering so the slider must read from
    // the store rather than a hard-coded default.
    const { store } = createAppStore();
    store.dispatch(setStarCatalogSize(6.0));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Star size');
    expect(slider.getAttribute('aria-valuenow')).toBe('6');
  });

  it('dispatches setStarCatalogSize and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogSize(5.0));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Star size'), { key: 'ArrowRight' });

    expect(selectStarCatalogSize(store.getState())).toBeCloseTo(5.1);
  });

  it('reflects seeded brightness in the star-brightness slider value', () => {
    // Dispatch a non-default brightness before rendering so the slider must read
    // from the store rather than a hard-coded default.
    const { store } = createAppStore();
    store.dispatch(setStarCatalogBrightness(2.0));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Star brightness');
    expect(slider.getAttribute('aria-valuenow')).toBe('2');
  });

  it('dispatches setStarCatalogBrightness and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    // Seed on the step grid (grid is offset from min=0.01, step 0.05), so
    // ArrowRight lands cleanly one step up.
    store.dispatch(setStarCatalogBrightness(1.01));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Star brightness'), { key: 'ArrowRight' });

    expect(selectStarCatalogBrightness(store.getState())).toBeCloseTo(1.06);
  });

  it('reflects seeded refineThreshold in the Detail slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogRefineThreshold(0.12));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Detail');
    expect(slider.getAttribute('aria-valuenow')).toBe('0.12');
  });

  it('dispatches setStarCatalogRefineThreshold and updates the store when the Detail slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogRefineThreshold(0.1));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Detail'), { key: 'ArrowRight' });

    expect(selectStarCatalogRefineThreshold(store.getState())).toBeCloseTo(0.11);
  });

  it('reflects seeded glowOverlap in the glow-overlap slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogGlowOverlap(1.8));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Glow overlap');
    expect(slider.getAttribute('aria-valuenow')).toBe('1.8');
  });

  it('dispatches setStarCatalogGlowOverlap and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogGlowOverlap(3.0));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Glow overlap'), { key: 'ArrowRight' });

    expect(selectStarCatalogGlowOverlap(store.getState())).toBeCloseTo(3.1);
  });

  it('reflects seeded exposureNearX in the Exposure (near) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureNearX(30));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Exposure (near)');
    expect(slider.getAttribute('aria-valuenow')).toBe('30');
  });

  it('dispatches setStarCatalogExposureNearX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureNearX(20));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Exposure (near)'), { key: 'ArrowRight' });

    expect(selectStarCatalogExposureNearX(store.getState())).toBeCloseTo(20.5);
  });

  it('reflects seeded exposureMidX in the Exposure (mid) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureMidX(40));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Exposure (mid)');
    expect(slider.getAttribute('aria-valuenow')).toBe('40');
  });

  it('dispatches setStarCatalogExposureMidX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureMidX(30));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Exposure (mid)'), { key: 'ArrowRight' });

    expect(selectStarCatalogExposureMidX(store.getState())).toBeCloseTo(31);
  });

  it('reflects seeded exposureFarX in the Exposure (far) slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureFarX(120));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Exposure (far)');
    expect(slider.getAttribute('aria-valuenow')).toBe('120');
  });

  it('dispatches setStarCatalogExposureFarX and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogExposureFarX(100));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Exposure (far)'), { key: 'ArrowRight' });

    expect(selectStarCatalogExposureFarX(store.getState())).toBeCloseTo(101);
  });

  it('reflects seeded aggregateIntensityCap in the Fog cap slider value', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogAggregateIntensityCap(0.2));

    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = sliderByLabel(container, 'Fog cap');
    expect(slider.getAttribute('aria-valuenow')).toBe('0.2');
  });

  it('dispatches setStarCatalogAggregateIntensityCap and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    store.dispatch(setStarCatalogAggregateIntensityCap(0.1));
    const { container } = render(createElement(StarsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    fireEvent.keyDown(sliderByLabel(container, 'Fog cap'), { key: 'ArrowRight' });

    expect(selectStarCatalogAggregateIntensityCap(store.getState())).toBeCloseTo(0.11);
  });
});
