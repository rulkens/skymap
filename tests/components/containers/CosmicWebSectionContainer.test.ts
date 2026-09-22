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
import { selectVolumesEnabled } from '../../../src/layers/volume/state/volumes/selectors';
import { selectFilamentsEnabled } from '../../../src/layers/filaments/state/filaments/selectors';
import { setVolumesEnabled } from '../../../src/layers/volume/state/volumes/slice';
import { setFilamentsEnabled } from '../../../src/layers/filaments/state/filaments/slice';
import type { AppStore } from '../../../src/store/types';

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
});
