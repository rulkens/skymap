// @vitest-environment jsdom

/**
 * LabelsSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * The container:
 *  - reads `selectStructureItems`, `selectGalaxyCatalogItems`, and
 *    `selectMilkyWayLabelEnabled` from the store
 *  - projects them → `labelCategoryVisibility` via
 *    `projectLabelCategoryVisibility`
 *  - routes dispatches to three homes: structure labels → `setStructureLabelEnabled`,
 *    milkyWay singleton → `setMilkyWayLabelEnabled`, galaxy-catalog labels
 *    (famousGalaxy) → `setGalaxyCatalogLabelEnabled`
 *
 * The CRITICAL tests: three store-backed assertions proving the 3-way dispatch
 * lands on the correct home — toggling a structure-label category flips that
 * structure item's `labelEnabled` flag; toggling `milkyWay` flips
 * `selectMilkyWayLabelEnabled`; toggling `famousGalaxy` flips the galaxy
 * catalog item's `labelEnabled` flag.
 *
 * Tests assert on `store.getState()` via selectors — RTK dispatch is
 * synchronous so the store reflects the new value immediately after the
 * fireEvent.click. No need to await re-renders.
 *
 * Gotchas:
 *  - CollapsibleSection defaults to closed; expand via the header button before
 *    querying per-category body checkboxes.
 *  - fireEvent.click is the reliable trigger for controlled checkboxes in jsdom.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import LabelsSectionContainer from '../../../src/components/containers/LabelsSectionContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
} from '../../../src/state/settings/selectors';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('LabelsSectionContainer', () => {
  it('renders with default store state: constellations off, rest on → master indeterminate', () => {
    const { store } = createAppStore();
    const { container } = render(createElement(LabelsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Master checkbox (in the header) should be indeterminate — the constellations
    // overlay defaults off while every other label row defaults on.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.checked).toBe(false);
    expect(headerCheckbox.indeterminate).toBe(true);
  });

  it('reflects a per-category labelEnabled=false from pre-seeded store state (structure)', () => {
    const { store } = createAppStore();
    // Disable cluster label before rendering.
    store.dispatch({
      type: 'settings/setStructureLabelEnabled',
      payload: { id: 'cluster', enabled: false },
    });

    const { container } = render(createElement(LabelsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // With cluster label disabled and others enabled → mixed → master is indeterminate.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.indeterminate).toBe(true);

    // Expand the section to access per-category checkboxes.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-label-cluster');
    expect(clusterCheckbox).not.toBeNull();
    expect(clusterCheckbox!.checked).toBe(false);
  });

  // ── CRITICAL: 3-way dispatch tests ────────────────────────────────────────────

  it('[3-way dispatch] toggling a structure label category flips the structure item labelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: cluster.labelEnabled is true.
    expect(selectStructureItems(store.getState())['cluster'].labelEnabled).toBe(true);

    const { container } = render(createElement(LabelsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Expand to reach per-category body controls.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    // cluster label starts enabled (checked); click dispatches enabled=false.
    const clusterCheckbox = container.querySelector<HTMLInputElement>('#toggle-label-cluster')!;
    expect(clusterCheckbox).not.toBeNull();
    fireEvent.click(clusterCheckbox);

    // Assert the structure item's labelEnabled flipped — confirming setStructureLabelEnabled.
    expect(selectStructureItems(store.getState())['cluster'].labelEnabled).toBe(false);
  });

  it('[3-way dispatch] toggling milkyWay label flips selectMilkyWayLabelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: milkyWay label is enabled.
    expect(selectMilkyWayLabelEnabled(store.getState())).toBe(true);

    const { container } = render(createElement(LabelsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Expand to reach per-category body controls.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    // milkyWay label starts enabled (checked); click dispatches enabled=false.
    const milkyWayCheckbox = container.querySelector<HTMLInputElement>('#toggle-label-milkyWay')!;
    expect(milkyWayCheckbox).not.toBeNull();
    fireEvent.click(milkyWayCheckbox);

    // Assert the milkyWay scalar labelEnabled flipped — confirming setMilkyWayLabelEnabled.
    expect(selectMilkyWayLabelEnabled(store.getState())).toBe(false);
  });

  it('[3-way dispatch] toggling famousGalaxy label flips the galaxy catalog item labelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: famousGalaxy.labelEnabled is true.
    expect(selectGalaxyCatalogItems(store.getState())['famousGalaxy'].labelEnabled).toBe(true);

    const { container } = render(createElement(LabelsSectionContainer, null), {
      wrapper: makeWrapper(store),
    });

    // Expand to reach per-category body controls.
    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    // famousGalaxy label starts enabled (checked); click dispatches enabled=false.
    const famousCheckbox = container.querySelector<HTMLInputElement>('#toggle-label-famousGalaxy')!;
    expect(famousCheckbox).not.toBeNull();
    fireEvent.click(famousCheckbox);

    // Assert the galaxy catalog item's labelEnabled flipped — confirming setGalaxyCatalogLabelEnabled.
    expect(selectGalaxyCatalogItems(store.getState())['famousGalaxy'].labelEnabled).toBe(false);
  });
});
