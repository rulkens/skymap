/**
 * Store types — the three derived types every call site reads the store through.
 *
 * `RootState`, `AppStore`, and `AppDispatch` are all derived (never hand-authored)
 * so they can't drift from the actual store: `RootState` follows the reducer
 * combine, `AppStore` follows the factory's return type, and `AppDispatch` follows
 * the store's wired middleware (thunk + saga). Centralising them here means a
 * component or hook annotates against one import rather than re-deriving
 * `ReturnType<typeof rootReducer>` at every selector.
 *
 * The imports are type-only, so there is no runtime cycle even though
 * `createAppStore` imports `rootReducer` and this file imports both — `import type`
 * is erased before the module graph is evaluated.
 */

import type { rootReducer } from './rootReducer';
import type { createAppStore } from './createAppStore';

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
