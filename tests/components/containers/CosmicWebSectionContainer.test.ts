// @vitest-environment jsdom

/**
 * CosmicWebSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * Tests assert:
 *  - Toggling the master checkbox dispatches `setVolumesEnabled(true)` and
 *    `setFilamentsEnabled(false)` (the "restore to Smooth" default) when the
 *    group's master flips from OFF to ON; `selectVolumesEnabled` and
 *    `selectFilamentsEnabled` reflect the new values.
 *  - Toggling the master checkbox from ON dispatches both
 *    `setVolumesEnabled(false)` and `setFilamentsEnabled(false)`.
 *  - `debug-*` fields are filtered out of the rendered rows: seed a
 *    `debug-gaussian` field via `addVolumeField`, verify its row is absent from
 *    the rendered output while a real cf4-density row still renders when present.
 *
 * Why assert on `store.getState()` rather than re-reading the DOM: RTK
 * `dispatch` is synchronous, so the store reflects the new value immediately.
 * The canonical "did the action land?" check is `selectX(store.getState())`
 * — no need to wait for a re-render to confirm the correct action was fired.
 *
 * Checkbox toggle: fireEvent.click — the reliable trigger for controlled
 * checkboxes in jsdom; fireEvent.change does not update e.target.checked for
 * React-controlled inputs.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import CosmicWebSectionContainer from '../../../src/components/containers/CosmicWebSectionContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import {
  selectVolumesEnabled,
  selectFilamentsEnabled,
} from '../../../src/state/settings/selectors';
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  addVolumeField,
} from '../../../src/state/settings/settingsSlice';
import type { AppStore } from '../../../src/store/types';
import type { VolumeFieldId } from '../../../src/@types/data/volume/VolumeFieldId';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('CosmicWebSectionContainer', () => {
  describe('master toggle — OFF to ON (restore to Smooth)', () => {
    it('dispatches setVolumesEnabled(true) and setFilamentsEnabled(false) when master is toggled from OFF', () => {
      const { store } = createAppStore();
      // Ensure master starts OFF (both underlying masters off)
      store.dispatch(setVolumesEnabled(false));
      store.dispatch(setFilamentsEnabled(false));

      const { container } = render(createElement(CosmicWebSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);

      // Click turns the master ON → restores to Smooth (volumes on, filaments off)
      fireEvent.click(headerCheckbox);

      expect(selectVolumesEnabled(store.getState())).toBe(true);
      expect(selectFilamentsEnabled(store.getState())).toBe(false);
    });
  });

  describe('master toggle — ON to OFF', () => {
    it('dispatches setVolumesEnabled(false) and setFilamentsEnabled(false) when master is toggled from ON', () => {
      const { store } = createAppStore();
      // Ensure master starts ON via volumes
      store.dispatch(setVolumesEnabled(true));
      store.dispatch(setFilamentsEnabled(false));

      const { container } = render(createElement(CosmicWebSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);

      // Click turns the master OFF → both disabled
      fireEvent.click(headerCheckbox);

      expect(selectVolumesEnabled(store.getState())).toBe(false);
      expect(selectFilamentsEnabled(store.getState())).toBe(false);
    });
  });

  describe('debug-* field filtering', () => {
    it('does not render a row for a debug-gaussian field added to the store', () => {
      const { store } = createAppStore();
      // Seed a debug field — addVolumeField is a no-op for already-seeded ids,
      // but debug-gaussian is not in seedVolumeFields() (binBaseName: null exclusion),
      // so this adds a genuine new row to volumes.items.
      store.dispatch(addVolumeField('debug-gaussian' as VolumeFieldId));

      const { container } = render(createElement(CosmicWebSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      // The debug row's label would be "Gaussian (debug)" — should be absent
      expect(container.textContent).not.toContain('Gaussian (debug)');
    });

    it('renders a real cf4-density row when volumesEnabled is true and items are seeded', () => {
      const { store } = createAppStore();
      // cf4-density is seeded by buildInitialSettings via seedVolumeFields.
      // Enable it and enable the volumes master so the section renders the rows.
      store.dispatch(setVolumesEnabled(true));

      const { container } = render(createElement(CosmicWebSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      // cf4-density label from volumeFieldDefaults is "CF-4 DM density"
      expect(container.textContent).toContain('CF-4 DM density');
    });
  });
});
