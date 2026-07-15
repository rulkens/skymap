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
import { selectStarCatalogs } from '../../../src/state/settings/selectors';
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
});
