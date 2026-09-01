/**
 * rootSaga — composes every feature watcher saga, mirroring `src/store/rootSaga.ts`.
 * The Viewport-owned closures still to migrate (harness build/rebuild) move in
 * later tasks (T6-T12 of the mcpm-workbench-sagas plan), not this one.
 */
import { all } from 'typed-redux-saga';

import { watchCatalogSaga } from '../state/catalog/watchCatalogSaga';

export function* mainSaga() {
  yield* all([watchCatalogSaga()]);
}
