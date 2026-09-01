import { createAction } from '@reduxjs/toolkit';

/**
 * sagaContextRegistered — mirrors `src/store/sagaContextRegistered.ts`: the
 * signal that `registerSagaContext` has run, so `watchCatalogSaga`'s boot
 * trigger can `take` it instead of racing `getContext`'s silent `undefined`.
 * Its own file, not inlined into `createWorkbenchStore`, to avoid a cycle
 * (`rootSaga` forks watcher sagas; `createWorkbenchStore` imports `rootSaga`).
 */
export const sagaContextRegistered = createAction('mcpm-workbench/store/sagaContextRegistered');
