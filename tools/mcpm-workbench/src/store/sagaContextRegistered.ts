import { createAction } from '@reduxjs/toolkit';

/**
 * sagaContextRegistered — mirrors `src/store/sagaContextRegistered.ts`: the
 * signal that `registerSagaContext` has run, for a saga that must dispatch on
 * its own initiative (no consumer yet — `rootSaga` is `all([])`) to `take`
 * instead of racing `getContext`'s silent `undefined`. Its own file, not
 * inlined into `createWorkbenchStore`, so a future watcher saga can import it
 * without importing the store factory back (`rootSaga` forks watcher sagas,
 * and `createWorkbenchStore` imports `rootSaga` — inlining here would cycle).
 */
export const sagaContextRegistered = createAction('mcpm-workbench/store/sagaContextRegistered');
