/**
 * rootReducer — the Redux store's single combine point.
 *
 * Today the store holds exactly one slice (`settings`), so a bare
 * `combineReducers` with one route looks like ceremony over `settingsReducer`
 * directly. It earns its keep as the forward-compatible shape: `RootState` is
 * derived from this combine, and the selection fold extends the store by adding
 * sibling routes here rather than re-wiring every call site. A flat single
 * reducer would force a structural migration the first time a second slice lands.
 *
 * The route key comes from `settingsRoute` (not an inline `'settings'`) so the
 * literal type flows into `RootState` and the reducer wiring shares the exact key
 * that selectors read by — a misspelt route fails at compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
});
