/**
 * createAppStore — a FACTORY that builds a fresh Redux store per call.
 *
 * The reference shape (RTK `configureStore` + saga middleware + `run(mainSaga)`)
 * is module-singleton in most apps. skymap diverges deliberately: it constructs
 * engines repeatedly across the test suite, and a shared singleton store would
 * leak settings state from one engine into the next. A factory hands each engine
 * (and each test) its own isolated store, so there is no cross-construction
 * bleed.
 *
 * The saga middleware is wired and `mainSaga` is run at construction even though
 * the root saga forks nothing yet — see `rootSaga`. Running an empty root now
 * means phase 2 adds feature sagas without touching this factory.
 *
 * Notably absent: NO `serializableCheck: false` and NO `enableMapSet`. The whole
 * point of this migration is that the settings state is now fully serializable —
 * `disabledPasses` is a plain `Record`, not a `Set` — so RTK's default
 * serializability + immutability checks are kept on as a correctness guard rather
 * than disabled. Re-introducing either escape hatch would silently re-admit the
 * non-serializable shapes the migration removed.
 */

import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from './rootReducer';
import { mainSaga } from './rootSaga';
import { settingsRoute, uiRoute } from './constants';
import type { EngineSettingsState } from '../@types/settings/EngineSettingsState';
import type { UiState } from '../@types/ui/UiState';

// The store's preloaded shape mirrors the route map RTK's `preloadedState`
// expects. The `ui` key is optional: callers that care only about settings
// (engine wiring tests, tour restore) omit it and the slice self-seeds from
// `buildInitialUiState()`. An explicit seed is only needed at boot time for
// freshness (main.tsx reads localStorage + URL once before React mounts).
export type PreloadedState = { [settingsRoute]: EngineSettingsState; [uiRoute]?: UiState };

export function createAppStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return store;
}
