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
 * The master tri-state folds every `layerRows` entry on top of the label
 * categories the registry derives. The label rows default on; the
 * constellations Layer row (passed in via `layerRows`) defaults off, so together
 * they pin the default-state master into the indeterminate case. A Layer row
 * names its show entry; the selector reads and writes the switch through it.
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

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import LabelsAndGuidesSectionContainer from '../../../src/components/containers/LabelsAndGuidesSectionContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import { selectStructureItems } from '../../../src/layers/structure/state/structures/selectors';
import { selectGalaxyCatalogItems } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { selectMilkyWayLabelEnabled } from '../../../src/layers/milkyWay/state/milkyWay/selectors';
import { selectOrbitTrailsEnabled } from '../../../src/layers/body/state/orbitTrails/selectors';
import { selectLocalBubble } from '../../../src/layers/localBubble/state/localBubble/selectors';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';
import type { AppStore } from '../../../src/store/types';

// The composed rows, one stable array, as `SettingsSections` passes them.
const LAYER_ROWS = layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides');

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('LabelsAndGuidesSectionContainer', () => {
  it('renders with default store state: constellations off, rest on → master indeterminate', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, {
        layerRows: [{ toggle: 'constellations', label: 'Constellations' }],
      }),
      {
        wrapper: makeWrapper(store),
      },
    );

    // Master checkbox (in the header) should be indeterminate — the constellations
    // overlay defaults off while every label row defaults on.
    const headerCheckbox = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
    expect(headerCheckbox.checked).toBe(false);
    expect(headerCheckbox.indeterminate).toBe(true);
  });

  // ── CRITICAL: label-home dispatch tests ───────────────────────────────────────

  it('[label-home dispatch] toggling a structure label category flips the structure item labelEnabled in the store', () => {
    const { store } = createAppStore();
    // Confirm initial state: cluster.labelEnabled is true.
    expect(selectStructureItems(store.getState())['galaxy-cluster'].labelEnabled).toBe(true);

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
    const clusterCheckbox = container.querySelector<HTMLInputElement>(
      '#toggle-label-galaxy-cluster',
    )!;
    expect(clusterCheckbox).not.toBeNull();
    fireEvent.click(clusterCheckbox);

    // Assert the structure item's labelEnabled flipped — confirming setStructureLabelEnabled.
    expect(selectStructureItems(store.getState())['galaxy-cluster'].labelEnabled).toBe(false);
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

  it('toggling the Orbit trails row dispatches setVisibility on its own cluster', () => {
    const { store } = createAppStore();
    expect(selectOrbitTrailsEnabled(store.getState())).toBe(true);
    const dispatch = vi.spyOn(store, 'dispatch');

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: LAYER_ROWS }),
      { wrapper: makeWrapper(store) },
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[type=button]')!);

    const orbitTrailsCheckbox = container.querySelector<HTMLInputElement>('#toggle-orbitTrails')!;
    expect(orbitTrailsCheckbox).not.toBeNull();
    expect(orbitTrailsCheckbox.checked).toBe(true);
    fireEvent.click(orbitTrailsCheckbox);

    expect(dispatch).toHaveBeenCalledWith(
      setVisibility({ cluster: 'orbitTrails', field: 'enabled', on: false }),
    );
    expect(selectOrbitTrailsEnabled(store.getState())).toBe(false);
  });

  // ── layerRows ──────────────────────────────────────────────────────────────────

  it('renders the Layer rows in composition order, Orbit trails last', () => {
    const { store } = createAppStore();
    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: LAYER_ROWS }),
      { wrapper: makeWrapper(store) },
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[type=button]')!);

    const zoaCheckbox = container.querySelector<HTMLInputElement>('#toggle-zoneOfAvoidance')!;
    const orbitTrailsCheckbox = container.querySelector<HTMLInputElement>('#toggle-orbitTrails')!;
    expect(zoaCheckbox).not.toBeNull();
    expect(
      zoaCheckbox.compareDocumentPosition(orbitTrailsCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes[boxes.length - 1]).toBe(orbitTrailsCheckbox);
  });

  it('the Local Bubble row reads the store and dispatches setVisibility', () => {
    const { store } = createAppStore();
    expect(selectLocalBubble(store.getState()).enabled).toBe(false);
    const dispatch = vi.spyOn(store, 'dispatch');

    const { container } = render(
      createElement(LabelsAndGuidesSectionContainer, { layerRows: LAYER_ROWS }),
      { wrapper: makeWrapper(store) },
    );
    fireEvent.click(container.querySelector<HTMLButtonElement>('button[type=button]')!);

    const bubbleCheckbox = container.querySelector<HTMLInputElement>('#toggle-localBubble')!;
    expect(bubbleCheckbox.checked).toBe(false);
    fireEvent.click(bubbleCheckbox);

    expect(dispatch).toHaveBeenCalledWith(
      setVisibility({ cluster: 'localBubble', field: 'enabled', on: true }),
    );
    expect(selectLocalBubble(store.getState()).enabled).toBe(true);
    expect(bubbleCheckbox.checked).toBe(true);
  });
});
