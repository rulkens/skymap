/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store combines six slices — `settings`, `ui`, `tier`, `camera`,
 * `selection`, and `selectionRows` — via `combineReducers`. This
 * forward-compatible shape derives `RootState` from the combine and makes new
 * sibling routes additive edits here rather than structural migrations across
 * every call site. A flat single reducer would have forced a migration the
 * moment `tier` lifted out of the settings slice into its own root slice.
 *
 * `camera` holds the camera Intent (base pose, tween descriptor, auto-rotate,
 * dragging flag). The selection fold adds two sibling routes: `selection` holds
 * the raw identity-Intent refs (hover/select/focus); `selectionRows` is the
 * saga-owned derived display cache that InfoCard reads.
 *
 * Each route key comes from a `./constants` literal (not an inline `'settings'`
 * / `'ui'` / `'tier'` / `'camera'`) so the literal types flow into `RootState`
 * and the reducer wiring shares the exact keys that selectors read by — a
 * misspelt route fails at compile time, not runtime.
 */

import { combineReducers } from '@reduxjs/toolkit';

import {
  settingsRoute,
  uiRoute,
  tierRoute,
  cameraRoute,
  selectionRoute,
  selectionRowsRoute,
  tourRoute,
} from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import uiReducer from '../state/ui/uiSlice';
import tierReducer from '../state/tier/tierSlice';
import cameraReducer from '../state/camera/cameraSlice';
import selectionReducer from '../state/selection/selectionSlice';
import selectionRowsReducer from '../state/selectionRows/selectionRowsSlice';
import tourReducer from '../state/tour/tourSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
  [tierRoute]: tierReducer,
  [cameraRoute]: cameraReducer,
  [selectionRoute]: selectionReducer,
  [selectionRowsRoute]: selectionRowsReducer,
  [tourRoute]: tourReducer,
});
