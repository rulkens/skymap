// @vitest-environment jsdom

/**
 * StarCatalogTuningSectionContainer — each slider must write ITS setting: the
 * key -> action map is six look-alike entries, so a swapped pair compiles.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import StarCatalogTuningSectionContainer from '../../../../src/layers/starCatalog/ui/StarCatalogTuningSectionContainer';
import { STAR_CATALOG_TUNING_FIELDS } from '../../../../src/layers/starCatalog/ui/starCatalogTuningFields';
import { createTestStore as createAppStore } from '../../../support/createTestStore';
import { factsReported, layerFactsSeeded } from '../../../../src/state/engine/engineSlice';
import { selectStarCatalogs } from '../../../../src/layers/starCatalog/state/starCatalogs/selectors';

describe('StarCatalogTuningSectionContainer', () => {
  it.each(STAR_CATALOG_TUNING_FIELDS.map((f) => [f.label, f.key, f.max] as const))(
    '%s writes starCatalogs.%s',
    (label, key, max) => {
      const { store } = createAppStore();
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children });
      const { container } = render(createElement(StarCatalogTuningSectionContainer, null), {
        wrapper,
      });
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      fireEvent.change(input, { target: { value: String(max) } });
      expect(selectStarCatalogs(store.getState())[key]).toBe(max);
    },
  );

  it('the chunk-slots picker writes the override, and "Tier default" clears it', () => {
    const { store } = createAppStore();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    const { container } = render(createElement(StarCatalogTuningSectionContainer, null), {
      wrapper,
    });
    const select = container.querySelector<HTMLSelectElement>('select')!;
    fireEvent.change(select, { target: { value: '384' } });
    expect(selectStarCatalogs(store.getState()).chunkSlotsOverride).toBe(384);
    fireEvent.change(select, { target: { value: '' } });
    expect(selectStarCatalogs(store.getState()).chunkSlotsOverride).toBeNull();
  });

  it('shows a refused pool size under the picker and drops it once a valid size lands', () => {
    const { store } = createAppStore();
    const facts = { famousStarsMeta: [], chunkSlotsError: null };
    store.dispatch(layerFactsSeeded({ layer: 'starCatalog', facts }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    const { container } = render(createElement(StarCatalogTuningSectionContainer, null), {
      wrapper,
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const report = (chunkSlotsError: string | null) =>
      act(() => {
        store.dispatch(factsReported({ layer: 'starCatalog', patch: { chunkSlotsError } }));
      });
    report('star pool: 512 slots overflow the row index; only 384 slots fit');
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('only 384 slots fit');

    report(null);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
