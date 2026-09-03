/**
 * createSceneStore — a factory (not a module singleton), mirroring
 * `src/store/createAppStore.ts` and `mcpm-workbench`'s `createWorkbenchStore`
 * including its `registerSagaContext` merge-then-announce ordering.
 */
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';

import { rootReducer } from './rootReducer';
import { mainSaga } from './rootSaga';
import { sagaContextRegistered } from './sagaContextRegistered';
import type { RootState } from './types';
import type { SceneSagaContext } from './sagaContext';

export type PreloadedState = Partial<RootState>;

export function createSceneStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return {
    store,
    registerSagaContext: (ctx: SceneSagaContext) => {
      sagaMiddleware.setContext(ctx);
      store.dispatch(sagaContextRegistered());
    },
  };
}
