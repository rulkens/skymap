/**
 * createWorkbenchStore — a factory (not a module singleton), mirroring
 * `src/store/createAppStore.ts` including its `registerSagaContext`
 * merge-then-announce ordering (see that file's header for the full
 * argument); no consumer awaits it yet, `rootSaga` being `all([])`.
 *
 * Unlike the main app, this state legitimately holds typed arrays —
 * `catalog.packedOverride`'s `Float32Array`s and `histogram.counts`'s
 * `Uint32Array` — so both RTK dev checks ignore exactly those paths: flagging
 * every dispatch near a multi-million-float catalog as non-serializable is
 * noise, and immutableCheck's deep freeze/diff over the same arrays is a
 * real per-frame cost, not just a warning.
 */
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from './rootReducer';
import { mainSaga } from './rootSaga';
import { sagaContextRegistered } from './sagaContextRegistered';
import type { RootState } from './types';
import type { WorkbenchSagaContext } from './sagaContext';

const TYPED_ARRAY_STATE_PATHS = ['catalog.packedOverride', 'histogram.counts'];
const TYPED_ARRAY_ACTION_PATHS = ['payload.points', 'payload.counts', 'payload.densities'];

export type PreloadedState = Partial<RootState>;

export function createWorkbenchStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredPaths: TYPED_ARRAY_STATE_PATHS,
          ignoredActionPaths: TYPED_ARRAY_ACTION_PATHS,
        },
        immutableCheck: { ignoredPaths: TYPED_ARRAY_STATE_PATHS },
      }).concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return {
    store,
    registerSagaContext: (ctx: WorkbenchSagaContext) => {
      sagaMiddleware.setContext(ctx);
      store.dispatch(sagaContextRegistered());
    },
  };
}
