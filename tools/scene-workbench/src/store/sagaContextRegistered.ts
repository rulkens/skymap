import { createAction } from '@reduxjs/toolkit';

/** Signal that `registerSagaContext` has run, so a boot-trigger watcher can
 *  `take` it instead of racing `getContext`'s silent `undefined`. Its own
 *  file, not inlined into `createSceneStore`, to avoid a cycle (`rootSaga`
 *  forks watcher sagas; `createSceneStore` imports `rootSaga`). */
export const sagaContextRegistered = createAction('scene-workbench/store/sagaContextRegistered');
