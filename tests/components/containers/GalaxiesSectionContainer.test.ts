// @vitest-environment jsdom

/**
 * GalaxiesSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * Tests assert:
 *  - The container reads `selectGalaxyCatalogSize` and forwards it to the
 *    point-size slider's `value`. We seed via a pre-render dispatch so the
 *    preloaded-state shape never has to be manually reproduced.
 *  - Moving the slider dispatches `setGalaxyCatalogSize`, so
 *    `selectGalaxyCatalogSize(store.getState())` reflects the new value.
 *  - Toggling a per-catalog checkbox dispatches `setGalaxyCatalogVisible`,
 *    so `selectVisibleSourceMask(store.getState())` changes.
 *
 * Why assert on `store.getState()` rather than re-reading the DOM: RTK
 * `dispatch` is synchronous, so the store reflects the new value immediately.
 * The canonical "did the action land?" check is `selectX(store.getState())`
 * — no need to wait for a re-render to confirm the correct action was fired.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import GalaxiesSectionContainer from '../../../src/components/containers/GalaxiesSectionContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectGalaxyCatalogSize,
  selectVisibleSourceMask,
} from '../../../src/state/settings/selectors';
import { setGalaxyCatalogSize } from '../../../src/state/settings/settingsSlice';
import { Source } from '../../../src/data/source';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('GalaxiesSectionContainer', () => {
  it('reflects seeded sizePx in the point-size slider value', () => {
    // Dispatch a non-default size before rendering so the slider must read from
    // the store rather than a hard-coded default.
    const { store } = createAppStore();
    store.dispatch(setGalaxyCatalogSize(6.0));

    const { container } = render(createElement(GalaxiesSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-point-size');
    expect(slider).not.toBeNull();
    expect(slider!.value).toBe('6');
  });

  it('dispatches setGalaxyCatalogSize and updates the store when the slider moves', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(GalaxiesSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    const slider = container.querySelector<HTMLInputElement>('#slider-point-size')!;
    fireEvent.change(slider, { target: { value: '5.2' } });

    expect(selectGalaxyCatalogSize(store.getState())).toBeCloseTo(5.2);
  });

  it('dispatches setGalaxyCatalogVisible and updates selectVisibleSourceMask when a catalog is toggled', () => {
    const { store } = createAppStore();
    const initialMask = selectVisibleSourceMask(store.getState());

    const { container } = render(createElement(GalaxiesSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Toggle SDSS off — it starts enabled in the default store state
    const sdssCheckbox = container.querySelector<HTMLInputElement>(`#toggle-source-${Source.SDSS}`);
    expect(sdssCheckbox).not.toBeNull();
    expect(sdssCheckbox!.checked).toBe(true);

    // SDSS starts checked; fireEvent.click is the reliable trigger for
    // controlled checkboxes in jsdom — fireEvent.change does not update
    // e.target.checked for React-controlled inputs.
    fireEvent.click(sdssCheckbox!);

    const newMask = selectVisibleSourceMask(store.getState());
    expect(newMask).not.toBe(initialMask);
    // SDSS bit (1 << Source.SDSS) must be cleared
    expect(newMask & (1 << Source.SDSS)).toBe(0);
  });
});
