/**
 * rootSaga — composes every feature watcher saga, mirroring `src/store/rootSaga.ts`.
 * The Viewport-owned closures still to migrate (preview-packed, histogram,
 * palette re-attach) move in later tasks (T9-T11 of the mcpm-workbench-sagas plan),
 * not this one.
 */
import { all } from 'typed-redux-saga';

import { watchCatalogSaga } from '../state/catalog/watchCatalogSaga';
import { watchExportSaga } from '../state/export/watchExportSaga';
import { watchSceneSaga } from '../state/scene/watchSceneSaga';
import { watchSimCommandsSaga } from '../state/sim/watchSimCommandsSaga';

export function* mainSaga() {
  yield* all([watchCatalogSaga(), watchSceneSaga(), watchSimCommandsSaga(), watchExportSaga()]);
}
