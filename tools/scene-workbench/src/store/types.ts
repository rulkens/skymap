/**
 * Store types — derived, never hand-authored, so they can't drift from the
 * actual store (type-only imports, so no runtime cycle with `createSceneStore`).
 */
import type { rootReducer } from './rootReducer';
import type { createSceneStore } from './createSceneStore';

export type RootState = ReturnType<typeof rootReducer>;
export type SceneStore = ReturnType<typeof createSceneStore>['store'];
export type AppDispatch = SceneStore['dispatch'];
/** The factory result's other half — the one component that creates
 *  `RenderResources` and hands the pair to the saga context. */
export type RegisterSagaContext = ReturnType<typeof createSceneStore>['registerSagaContext'];
