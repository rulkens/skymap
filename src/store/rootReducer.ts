/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store combines two slices (`settings` and `ui`) via `combineReducers`.
 * This forward-compatible shape derives `RootState` from the combine and makes
 * future sibling routes additive edits here rather than structural migrations
 * across all call sites.
 *
 * Route keys come from the `settingsRoute` and `uiRoute` constants (not inline
 * strings) so the literal types flow into `RootState` and the reducer wiring
 * shares the exact keys that selectors read by — a misspelt route fails at
 * compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import { settingsRoute, uiRoute } from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import uiReducer from '../state/ui/uiSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
});
