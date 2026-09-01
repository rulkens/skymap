/**
 * Store types — mirrors `src/store/types.ts` at workbench scale. `RootState`
 * and `WorkbenchStore` are derived (never hand-authored) so they can't drift
 * from the actual store: `RootState` follows the reducer combine, and
 * `WorkbenchStore` follows the factory's `store` property (imports are
 * type-only, so there's no runtime cycle with `createWorkbenchStore`).
 */
import type { rootReducer } from './rootReducer';
import type { createWorkbenchStore } from './createWorkbenchStore';

export type RootState = ReturnType<typeof rootReducer>;
export type WorkbenchStore = ReturnType<typeof createWorkbenchStore>['store'];
export type AppDispatch = WorkbenchStore['dispatch'];
