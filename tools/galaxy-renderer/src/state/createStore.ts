/**
 * createGalaxyStore — a FACTORY that builds a fresh Redux store per call,
 * for the same isolation reason as the main app's `src/store/createAppStore`:
 * the galaxy-renderer tool constructs a fresh engine per test (and per
 * Viewport mount), and a shared module-singleton store would leak one run's
 * params into the next.
 *
 * All seven `AppState` routes are mounted: the four param slices
 * (`galaxy`/`render`/`lod`/`fieldTuning`) plus the UI-adjacent trio
 * (`compare`/`extras`/`ui`). `AppStore`/`AppDispatch` are both DERIVED from
 * the reducer map (never hand-typed against `AppState` directly) so they can't drift from
 * what's actually combined below; the `_rootStateMatchesAppState` trip-wire
 * a few lines down catches the opposite drift — `AppState.d.ts` gaining or
 * losing a field without a matching edit here.
 *
 * `preloaded` is typed against the full `AppState` so a caller writes seed
 * code directly against the documented contract.
 */

import { combineReducers, configureStore } from '@reduxjs/toolkit';

import galaxyReducer from './slices/galaxySlice';
import renderReducer from './slices/renderSlice';
import lodReducer from './slices/lodSlice';
import fieldTuningReducer from './slices/fieldTuningSlice';
import compareReducer from './slices/compareSlice';
import extrasReducer from './slices/extrasSlice';
import uiReducer from './slices/uiSlice';
import type { AppState } from '../../@types/state/AppState';

const rootReducer = combineReducers({
  galaxy: galaxyReducer,
  render: renderReducer,
  lod: lodReducer,
  fieldTuning: fieldTuningReducer,
  compare: compareReducer,
  extras: extrasReducer,
  ui: uiReducer,
});

// Compile-time trip-wire: the reducer map's combined state and `AppState`
// must be mutually assignable. A field added to one without the other
// breaks the build right here, instead of surfacing as a silent `any` at
// some distant call site.
type _AssertRootStateMatchesAppState =
  ReturnType<typeof rootReducer> extends AppState
    ? AppState extends ReturnType<typeof rootReducer>
      ? true
      : never
    : never;
const _rootStateMatchesAppState: _AssertRootStateMatchesAppState = true;
void _rootStateMatchesAppState;

export function createGalaxyStore(preloaded?: Partial<AppState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState: preloaded,
  });
}

export type AppStore = ReturnType<typeof createGalaxyStore>;
export type AppDispatch = AppStore['dispatch'];
