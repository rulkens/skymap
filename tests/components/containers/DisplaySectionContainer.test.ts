// @vitest-environment jsdom

/**
 * DisplaySectionContainer — store-backed tests.
 *
 * Pattern: `createAppStore()` + `<Provider>` + `createElement` (no JSX —
 * matches `vitest.config.ts` `include` glob `tests/**\/*.test.ts`).
 *
 * Tests assert:
 *  - Changing the tone-curve dropdown dispatches `setToneMapCurve` with the
 *    newly selected numeric curve; `selectToneMapCurve(store.getState())`
 *    reflects the new value.
 *
 * Why assert on `store.getState()` rather than re-reading the DOM: RTK
 * `dispatch` is synchronous, so the store reflects the new value immediately.
 * The canonical "did the action land?" check is
 * `selectToneMapCurve(store.getState())` — no need to wait for a re-render to
 * confirm the correct action was fired.
 *
 * Dropdown change: fireEvent.change(select, { target: { value: '...' } }) —
 * the reliable trigger for controlled selects in jsdom.
 *
 * CollapsibleSection note: expand the section before querying the `<select>`.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import DisplaySectionContainer from '../../../src/components/containers/DisplaySectionContainer';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import { selectToneMapCurve } from '../../../src/state/settings/selectors';
import { setToneMapCurve } from '../../../src/state/settings/settingsSlice';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';
import type { AppStore } from '../../../src/store/types';

function makeWrapper(store: AppStore) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('DisplaySectionContainer', () => {
  describe('dropdown change — updates store', () => {
    it('sets selectToneMapCurve(store.getState()) to Linear (0) when the dropdown changes to 0', () => {
      const { store } = createAppStore();
      // Seed a non-Linear starting value to make the change unambiguous.
      store.dispatch(setToneMapCurve(ToneMapCurve.Reinhard));

      const { getByRole, getByLabelText } = render(createElement(DisplaySectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      // Expand the Display section (collapsed by default).
      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/tone curve/i);

      fireEvent.change(select, { target: { value: String(ToneMapCurve.Linear) } });

      expect(selectToneMapCurve(store.getState())).toBe(ToneMapCurve.Linear);
    });

    it('sets selectToneMapCurve(store.getState()) to Aces (4) when the dropdown changes to 4', () => {
      const { store } = createAppStore();
      // Seed Reinhard as the starting value.
      store.dispatch(setToneMapCurve(ToneMapCurve.Reinhard));

      const { getByRole, getByLabelText } = render(createElement(DisplaySectionContainer, null), {
        wrapper: makeWrapper(store),
      });

      fireEvent.click(getByRole('button', { name: /display/i }));
      const select = getByLabelText(/tone curve/i);

      fireEvent.change(select, { target: { value: String(ToneMapCurve.Aces) } });

      expect(selectToneMapCurve(store.getState())).toBe(ToneMapCurve.Aces);
    });
  });
});
