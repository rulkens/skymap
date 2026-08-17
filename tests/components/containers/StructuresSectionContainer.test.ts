// @vitest-environment jsdom

/**
 * StructuresSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * The container:
 *  - reads `selectStructureItems` + `selectStructureCounts` from the store
 *  - projects items → `markerCategoryVisibility` via `projectMarkerCategoryVisibility`
 *  - dispatches `setStructureItemEnabled` when a per-category checkbox is toggled
 *
 * `structureCounts` is no longer a prop — it is read from the engine Redux
 * slice via `selectStructureCounts`.  Tests that assert on count display seed
 * the engine slice via `engineStructureCountsChanged` before rendering.
 *
 * Tests assert on `store.getState()` via `selectStructureItems` rather than
 * re-reading the DOM: RTK `dispatch` is synchronous, so the store reflects the
 * new value immediately. The canonical "did the action land?" check is
 * `selectX(store.getState())` — no need to wait for a re-render to confirm the
 * correct action was fired.
 *
 * The CollapsibleSection defaults to closed, so the per-category body checkboxes
 * carry `aria-hidden`. Expand the section by clicking its <button> header before
 * querying body controls.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import StructuresSectionContainer from '../../../src/components/containers/StructuresSectionContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import { selectStructureItems } from '../../../src/state/settings/selectors';
import { engineStructureCountsChanged } from '../../../src/state/engine/engineSlice';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('StructuresSectionContainer', () => {
  it('renders with default store state: all categories enabled (allOn master)', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(StructuresSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Master checkbox (in the header) should be checked — initial state has all
    // structure items enabled = true.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.checked).toBe(true);
    expect(headerCheckbox.indeterminate).toBe(false);
  });

  it('reflects a per-category enabled=false from pre-seeded store state', () => {
    const { store } = createAppStore();
    // Disable 'cluster' before rendering so the checkbox must read from the store.
    store.dispatch({
      type: 'settings/setStructureItemEnabled',
      payload: { id: 'cluster', enabled: false },
    });

    const { container } = render(createElement(StructuresSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // With cluster disabled and others enabled → mixed → master is indeterminate.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.indeterminate).toBe(true);

    // Expand the section to access per-category checkboxes.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-marker-cluster');
    expect(clusterCheckbox).not.toBeNull();
    expect(clusterCheckbox!.checked).toBe(false);
  });

  it('dispatches setStructureItemEnabled and updates the store when a category checkbox is toggled', () => {
    const { store } = createAppStore();
    // Confirm initial state: cluster.enabled is true.
    expect(selectStructureItems(store.getState())['cluster'].enabled).toBe(true);

    const { container } = render(createElement(StructuresSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Expand the section to reach per-category body controls.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-marker-cluster')!;
    expect(clusterCheckbox).not.toBeNull();
    // cluster starts enabled (checked); a click dispatches enabled=false.
    // fireEvent.click is the reliable trigger for controlled checkboxes in jsdom.
    fireEvent.click(clusterCheckbox);

    expect(selectStructureItems(store.getState())['cluster'].enabled).toBe(false);
  });

  it('reads structureCounts from the engine slice and forwards them to the section body', () => {
    const { store } = createAppStore();
    // Seed the engine slice with a known count — the container reads
    // `selectStructureCounts` internally (no prop threading).
    store.dispatch(engineStructureCountsChanged({ cluster: 42 }));

    const { container } = render(
      createElement(StructuresSectionContainer, null),
      { wrapper: makeWrapper(store) },
    );

    // Expand the section to view body labels.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const clusterLabel = container.querySelector<HTMLLabelElement>(
      'label[for="toggle-marker-cluster"]',
    );
    expect(clusterLabel).not.toBeNull();
    expect(clusterLabel!.textContent).toContain('42');
  });
});
