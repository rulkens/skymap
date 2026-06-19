/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store combines five slices — `settings`, `ui`, `tier`, `selection`,
 * and `selectionRows` — via `combineReducers`. This
 * forward-compatible shape derives `RootState` from the combine and makes new
 * sibling routes additive edits here rather than structural migrations across
 * every call site. A flat single reducer would have forced a migration the
 * moment `tier` lifted out of the settings slice into its own root slice.
 *
 * The selection fold adds two sibling routes: `selection` holds the raw
 * identity-Intent refs (hover/select/focus); `selectionRows` is the
 * saga-owned derived display cache that InfoCard reads.
 *
 * Each route key comes from a `./constants` literal (not an inline `'settings'`
 * / `'ui'` / `'tier'`) so the literal types flow into `RootState` and the
 * reducer wiring shares the exact keys that selectors read by — a misspelt
 * route fails at compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute, uiRoute, tierRoute, selectionRoute, selectionRowsRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import uiReducer from '../state/ui/uiSlice';
import tierReducer from '../state/tier/tierSlice';
import selectionReducer from '../state/selection/selectionSlice';
import selectionRowsReducer from '../state/selectionRows/selectionRowsSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
  [tierRoute]: tierReducer,
  [selectionRoute]: selectionReducer,
  [selectionRowsRoute]: selectionRowsReducer,
});
