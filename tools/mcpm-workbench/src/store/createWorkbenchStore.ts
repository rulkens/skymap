/**
 * createWorkbenchStore — a factory (not a module singleton) mirroring
 * `src/store/createAppStore.ts`: wires RTK's `configureStore` plus saga
 * middleware, runs `mainSaga`, and hands back a `registerSagaContext` setter
 * that delegates to `sagaMiddleware.setContext` and then dispatches
 * `sagaContextRegistered` — the same "merge, then announce" ordering the main
 * app's factory uses. No consumer waits on it yet (rootSaga is `all([])`);
 * the seam exists so later tasks can register the canvas/render resources
 * without touching the factory again.
 *
 * Unlike the main app, this state legitimately holds typed arrays —
 * `catalog.packedOverride` (a dev-dropped catalog's `Float32Array` positions/
 * masses) and `histogram.counts` (`Uint32Array`) — so, unlike
 * `createAppStore.ts`'s "notably absent" serializableCheck config, both
 * checks here ignore exactly those paths (state and the actions that carry
 * them): flagging every dispatch near a multi-million-float catalog as
 * "non-serializable" is noise, and immutableCheck's deep freeze/diff over the
 * same arrays every dispatch is a real per-frame cost, not just a warning.
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
