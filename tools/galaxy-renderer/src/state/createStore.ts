/**
 * createGalaxyStore — a FACTORY that builds a fresh Redux store per call,
 * for the same isolation reason as the main app's `src/store/createAppStore`:
 * the galaxy-renderer tool constructs a fresh engine per test (and per
 * Viewport mount), and a shared module-singleton store would leak one run's
 * params into the next.
 *
 * Only the three param slices land here (`galaxy`/`render`/`lod`, plan 03
 * Task 2). `compare`/`extras`/`ui` — the remaining three `AppState` routes —
 * land in Task 3; wiring them is purely additive: add their reducer to the
 * `combineReducers` call below. `AppStore`/`AppDispatch` are both DERIVED
 * from the reducer map (never hand-typed against `AppState` directly), so
 * once all six routes are mounted the derived state type equals `AppState`
 * with no edits to this file's exports — that's the seam this task leaves
 * for Task 3.
 *
 * `preloaded` is typed against the full `AppState` (not just the currently-
 * mounted routes) so a caller can already write forward-compatible seed code
 * against the documented contract; `Partial<AppState>` structurally covers
 * `Partial` of whatever subset `rootReducer` actually combines today.
 */

import { combineReducers, configureStore } from '@reduxjs/toolkit';

import galaxyReducer from './slices/galaxySlice';
import renderReducer from './slices/renderSlice';
import lodReducer from './slices/lodSlice';
import type { AppState } from '../../@types/state/AppState';

const rootReducer = combineReducers({
  galaxy: galaxyReducer,
  render: renderReducer,
  lod: lodReducer,
});

export function createGalaxyStore(preloaded?: Partial<AppState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState: preloaded,
  });
}

export type AppStore = ReturnType<typeof createGalaxyStore>;
export type AppDispatch = AppStore['dispatch'];
