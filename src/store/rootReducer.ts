/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store now holds two slices — `settings` and `tier` — the first sibling the
 * forward-compatible `combineReducers` shape was built for. `RootState` is
 * derived from this combine, and the selection fold extends the store by adding
 * sibling routes here rather than re-wiring every call site. A flat single
 * reducer would have forced a structural migration the moment `tier` lifted out
 * of the settings slice into its own root slice.
 *
 * Each route key comes from a `./constants` literal (not an inline `'settings'`
 * / `'tier'`) so the literal type flows into `RootState` and the reducer wiring
 * shares the exact key that selectors read by — a misspelt route fails at
 * compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute, tierRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import tierReducer from '../state/tier/tierSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [tierRoute]: tierReducer,
});
