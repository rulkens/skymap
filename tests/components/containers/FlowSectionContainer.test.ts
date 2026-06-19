// @vitest-environment jsdom

/**
 * FlowSectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * Tests assert:
 *  - Toggling the header checkbox dispatches `setFlow({ enabled: true })` when
 *    the master is OFF; `selectFlow(store.getState()).enabled` reflects the new
 *    value.
 *  - Toggling the header checkbox dispatches `setFlow({ enabled: false })` when
 *    the master is ON; `selectFlow(store.getState()).enabled` reflects the new
 *    value.
 *
 * Why assert on `store.getState()` rather than re-reading the DOM: RTK
 * `dispatch` is synchronous, so the store reflects the new value immediately.
 * The canonical "did the action land?" check is `selectFlow(store.getState())`
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
import FlowSectionContainer from '../../../src/components/containers/FlowSectionContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { selectFlow } from '../../../src/state/settings/selectors';
import { setFlow } from '../../../src/state/settings/settingsSlice';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('FlowSectionContainer', () => {
  describe('header toggle — OFF to ON', () => {
    it('sets selectFlow(store.getState()).enabled to true when master is toggled from OFF', () => {
      const { store } = createAppStore();
      // Ensure master starts OFF.
      store.dispatch(setFlow({ enabled: false }));

      const { container } = render(createElement(FlowSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(false);

      fireEvent.click(headerCheckbox);

      expect(selectFlow(store.getState()).enabled).toBe(true);
    });
  });

  describe('header toggle — ON to OFF', () => {
    it('sets selectFlow(store.getState()).enabled to false when master is toggled from ON', () => {
      const { store } = createAppStore();
      // Ensure master starts ON.
      store.dispatch(setFlow({ enabled: true }));

      const { container } = render(createElement(FlowSectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      const headerCheckbox =
        container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!;
      expect(headerCheckbox.checked).toBe(true);

      fireEvent.click(headerCheckbox);

      expect(selectFlow(store.getState()).enabled).toBe(false);
    });
  });
});
