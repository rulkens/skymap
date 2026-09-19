// @vitest-environment jsdom

/**
 * LabelsAndGuidesSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * The container:
 *  - reads `selectStructureItems`, `selectGalaxyCatalogItems`,
 *    `selectStarCatalogItems`, `selectBodyItems`, and
 *    `selectMilkyWayLabelEnabled` from the store — one selector per
 *    label-bearing source-type cluster, plus the milkyWay scalar
 *  - projects them → `labelCategoryVisibility` via
 *    `projectLabelCategoryVisibility`
 *  - dispatches every label category's write through ONE table lookup,
 *    `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[category]]
 *    .write(category, enabled)` — the category's registry-declared source
 *    type picks the home; there is no hand-written per-home branch
 *
 * The CRITICAL tests: three store-backed assertions proving the table lookup
 * lands on the correct home for three different source types — toggling a
 * structure-label category flips that structure item's `labelEnabled` flag;
 * toggling `milkyWay` flips `selectMilkyWayLabelEnabled`; toggling
 * `famousGalaxy` flips the galaxy catalog item's `labelEnabled` flag.
 *
 * The master tri-state folds TWO non-category rows (constellations, orbit
 * trails) on top of the label categories the registry derives — star names
 * and body names are registry-derived categories themselves now, not
 * hand-authored rows, so only the two flat singleton guides sit outside that
 * derivation. `constellations` defaults off and every other row defaults on,
 * so the default-state master stays indeterminate whether the row count is
 * one or two; that scenario alone wouldn't catch a miscounted row.
 * `orbitTrailsEnabled` defaults on, so a store-seeded off is what actually
 * pins the second row into the tri-state arithmetic.
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
import LabelsAndGuidesSectionContainer from '../../../src/components/containers/LabelsAndGuidesSectionContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import {
  selectStructureItems,
  selectGalaxyCatalogItems,
  selectMilkyWayLabelEnabled,
  selectOrbitTrailsEnabled,
  selectZoneOfAvoidanceEnabled,
} from '../../../src/state/settings/selectors';
import { setZoneOfAvoidanceEnabled } from '../../../src/layers/zoneOfAvoidance/settings/zoneOfAvoidanceSlice';
import type { AppStore } from '../../../src/store/types';
import type { LayerSettingsRow } from '../../../src/@types/engine/layer/LayerSettingsRow';

// A stub Layer row riding the real ZoA toggle: proves the container reads a
// Layer row's `select` and dispatches its `set` action rather than special-casing it.
const STUB_LAYER_ROW: LayerSettingsRow = {
  id: 'toggle-stub-layer',
  label: 'Stub layer row',
  select: selectZoneOfAvoidanceEnabled,
  set: setZoneOfAvoidanceEnabled,
};

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('LabelsAndGuidesSectionContainer', () => {
  it('renders with default store state: constellations off, rest on → master indeterminate', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [] }),
      {
        wrapper: makeWrapper(store),
      },
    );

    // Master checkbox (in the header) should be indeterminate — the constellations
    // overlay defaults off while every other label row (orbit trails included)
    // defaults on.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.checked).toBe(false);
    expect(headerCheckbox.indeterminate).toBe(true);
  });

  // ── CRITICAL: label-home dispatch tests ───────────────────────────────────────

  it('[label-home dispatch] toggling a structure label category flips the structure item labelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: cluster.labelEnabled is true.
    expect(selectStructureItems(store.getState())['cluster'].labelEnabled).toBe(true);

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [] }),
      {
        wrapper: makeWrapper(store),
      },
    );

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

  it('[label-home dispatch] toggling milkyWay label flips selectMilkyWayLabelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: milkyWay label is enabled.
    expect(selectMilkyWayLabelEnabled(store.getState())).toBe(true);

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [] }),
      {
        wrapper: makeWrapper(store),
      },
    );

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

  it('[label-home dispatch] toggling famousGalaxy label flips the galaxy catalog item labelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: famousGalaxy.labelEnabled is true.
    expect(selectGalaxyCatalogItems(store.getState())['famousGalaxy'].labelEnabled).toBe(true);

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [] }),
      {
        wrapper: makeWrapper(store),
      },
    );

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

  it('toggling the orbit-trails row dispatches setOrbitTrailsEnabled', () => {
    const { store } = createAppStore();
    expect(selectOrbitTrailsEnabled(store.getState())).toBe(true);

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [] }),
      {
        wrapper: makeWrapper(store),
      },
    );

    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const orbitTrailsCheckbox = container.querySelector<HTMLInputElement>('#toggle-orbit-trails')!;
    expect(orbitTrailsCheckbox).not.toBeNull();
    expect(orbitTrailsCheckbox.checked).toBe(true);
    fireEvent.click(orbitTrailsCheckbox);

    expect(selectOrbitTrailsEnabled(store.getState())).toBe(false);
  });

  // ── layerRows (P1) ─────────────────────────────────────────────────────────────

  it('appends a Layer settings row after the core guide rows', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [STUB_LAYER_ROW] }),
      { wrapper: makeWrapper(store) },
    );

    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const zoaCheckbox = container.querySelector<HTMLInputElement>('#toggle-zone-of-avoidance')!;
    const stubCheckbox = container.querySelector<HTMLInputElement>('#toggle-stub-layer')!;
    expect(zoaCheckbox).not.toBeNull();
    expect(stubCheckbox).not.toBeNull();
    expect(
      zoaCheckbox.compareDocumentPosition(stubCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('a Layer row reads its value from the store and dispatches its own action', () => {
    const { store } = createAppStore();
    expect(selectZoneOfAvoidanceEnabled(store.getState())).toBe(true);

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: [STUB_LAYER_ROW] }),
      { wrapper: makeWrapper(store) },
    );

    const expandButton = container.querySelector<HTMLButtonElement>('button[type=button]')!;
    fireEvent.click(expandButton);

    const stubCheckbox = container.querySelector<HTMLInputElement>('#toggle-stub-layer')!;
    expect(stubCheckbox.checked).toBe(true);
    fireEvent.click(stubCheckbox);

    expect(selectZoneOfAvoidanceEnabled(store.getState())).toBe(false);
    expect(stubCheckbox.checked).toBe(false);
  });
});
