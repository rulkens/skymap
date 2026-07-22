/**
 * rootReducer — the Redux store's single combine point.
 *
 * The store combines slices — `settings`, `ui`, `tier`, `camera`,
 * `selection`, `selectionRows`, `tour`, `engine`, and `time` — via
 * `combineReducers`.
 * This forward-compatible shape derives `RootState` from the combine and makes
 * new sibling routes additive edits here rather than structural migrations
 * across every call site. A flat single reducer would have forced a migration
 * the moment `tier` lifted out of the settings slice into its own root slice.
 *
 * `camera` holds the camera Intent (base pose, tween descriptor, auto-rotate,
 * dragging flag). The selection fold adds two sibling routes: `selection` holds
 * the raw identity-Intent refs (hover/select/focus); `selectionRows` is the
 * saga-owned derived display cache that InfoCard reads. `engine` holds the
 * observable runtime state the engine reports (lifecycle status, per-source
 * galaxy counts, per-structure counts, load progress, scale-bar descriptor).
 * `time` holds the sim-clock intent (live/manual mode, the (simDays, realMs)
 * anchor, rate-ladder index, direction, pause) from which the current instant is
 * derived on demand — no per-frame store write.
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
  engineRoute,
  timeRoute,
} from './constants';
import settingsReducer from '../state/settings/settingsSlice';
import uiReducer from '../state/ui/uiSlice';
import tierReducer from '../state/tier/tierSlice';
import cameraReducer from '../state/camera/cameraSlice';
import selectionReducer from '../state/selection/selectionSlice';
import selectionRowsReducer from '../state/selectionRows/selectionRowsSlice';
import tourReducer from '../state/tour/tourSlice';
import engineReducer from '../state/engine/engineSlice';
import timeReducer from '../state/time/timeSlice';

export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
  [tierRoute]: tierReducer,
  [cameraRoute]: cameraReducer,
  [selectionRoute]: selectionReducer,
  [selectionRowsRoute]: selectionRowsReducer,
  [tourRoute]: tourReducer,
  [engineRoute]: engineReducer,
  [timeRoute]: timeReducer,
});
