/**
 * rootReducer — the Redux store's single combine point. Each route key comes from a `./constants`
 * literal, so the literal types flow into `RootState` and a misspelt route fails at compile time.
 *
 * `combineSlices`, not `combineReducers`, so a lazily loaded chunk can `inject` its own slice
 * after the store exists (ADR 0016). The static routes below are the app's whole `RootState`; an
 * injected slice is unknown to it and reads through its own `injectInto` selectors.
 */

import { combineSlices } from '@reduxjs/toolkit';

import {
  settingsRoute,
  uiRoute,
  tierRoute,
  cameraRoute,
  selectionRoute,
  selectionRowsRoute,
  tourRoute,
  takeoverRoute,
  engineRoute,
  timeRoute,
  arrivalRoute,
  inputRoute,
  remoteRoute,
  viewCoverRoute,
} from './constants';
import settingsReducer from '../state/settings/settingsReducer';
import uiReducer from '../state/ui/uiSlice';
import tierReducer from '../state/tier/tierSlice';
import cameraReducer from '../state/camera/cameraSlice';
import selectionReducer from '../state/selection/selectionSlice';
import selectionRowsReducer from '../state/selectionRows/selectionRowsSlice';
import tourReducer from '../state/tour/tourSlice';
import takeoverReducer from '../state/takeover/takeoverSlice';
import engineReducer from '../state/engine/engineSlice';
import timeReducer from '../state/time/timeSlice';
import arrivalReducer from '../state/arrival/arrivalSlice';
import inputReducer from '../state/input/inputSlice';
import remoteReducer from '../state/remote/remoteSlice';
import viewCoverReducer from '../state/viewCover/viewCoverSlice';

export const rootReducer = combineSlices({
  [settingsRoute]: settingsReducer,
  [uiRoute]: uiReducer,
  [tierRoute]: tierReducer,
  [cameraRoute]: cameraReducer,
  [selectionRoute]: selectionReducer,
  [selectionRowsRoute]: selectionRowsReducer,
  [tourRoute]: tourReducer,
  [takeoverRoute]: takeoverReducer,
  [engineRoute]: engineReducer,
  [timeRoute]: timeReducer,
  [arrivalRoute]: arrivalReducer,
  [inputRoute]: inputReducer,
  [remoteRoute]: remoteReducer,
  [viewCoverRoute]: viewCoverReducer,
});
