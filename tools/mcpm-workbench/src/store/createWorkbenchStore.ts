/**
 * createWorkbenchStore — a factory (not a module singleton), mirroring
 * `src/store/createAppStore.ts` including its `registerSagaContext`
 * merge-then-announce ordering. This state legitimately holds typed arrays —
 * `catalog.packedOverride`/`catalog.points`'s `Float32Array`s and
 * `histogram.counts`'s `Uint32Array` — so both RTK dev checks ignore exactly
 * those paths: serializableCheck would flag every multi-million-float
 * dispatch as noise, and immutableCheck's deep freeze/diff over them is a
 * real per-frame cost, not just a warning.
 */
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from './rootReducer';
import { mainSaga } from './rootSaga';
import { sagaContextRegistered } from './sagaContextRegistered';
import type { RootState } from './types';
import type { WorkbenchSagaContext } from './sagaContext';

const TYPED_ARRAY_STATE_PATHS = ['catalog.packedOverride', 'catalog.points', 'histogram.counts'];
const TYPED_ARRAY_ACTION_PATHS = [
  'payload.points',
  'payload.weights',
  'payload.counts',
  'payload.densities',
];

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
