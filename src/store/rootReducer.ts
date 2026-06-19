/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store combines three slices — `settings`, `ui`, and `tier` — via
 * `combineReducers`. This forward-compatible shape derives `RootState` from the
 * combine and makes new sibling routes additive edits here rather than
 * structural migrations across every call site. A flat single reducer would
 * have forced a migration the moment `tier` lifted out of the settings slice
 * into its own root slice.
 *
 * Each route key comes from a `./constants` literal (not an inline `'settings'`
 * / `'ui'` / `'tier'`) so the literal types flow into `RootState` and the
 * reducer wiring shares the exact keys that selectors read by — a misspelt
 * route fails at compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute, uiRoute, tierRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import uiReducer from '../state/ui/uiSlice';
import tierReducer from '../state/tier/tierSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
  [tierRoute]: tierReducer,
});
