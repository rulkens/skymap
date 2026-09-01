/**
 * Store types — mirrors `src/store/types.ts` at workbench scale. Derived,
 * never hand-authored, so they can't drift from the actual store (type-only
 * imports, so no runtime cycle with `createWorkbenchStore`).
 */
import type { rootReducer } from './rootReducer';
import type { createWorkbenchStore } from './createWorkbenchStore';

export type RootState = ReturnType<typeof rootReducer>;
export type WorkbenchStore = ReturnType<typeof createWorkbenchStore>['store'];
export type AppDispatch = WorkbenchStore['dispatch'];
/** The factory result's other half — Viewport's own prop, the one component
 * that creates `RenderResources` and hands the pair to the saga context. */
export type RegisterSagaContext = ReturnType<typeof createWorkbenchStore>['registerSagaContext'];
