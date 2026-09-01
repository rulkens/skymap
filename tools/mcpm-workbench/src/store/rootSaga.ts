/**
 * rootSaga — composes every feature watcher saga, mirroring `src/store/rootSaga.ts`.
 * The Viewport-owned closure still to migrate (palette re-attach) moves in a
 * later task (T11 of the mcpm-workbench-sagas plan), not this one.
 */
import { all } from 'typed-redux-saga';

import { watchCatalogSaga } from '../state/catalog/watchCatalogSaga';
import { watchExportSaga } from '../state/export/watchExportSaga';
import { watchHistogramSaga } from '../state/histogram/watchHistogramSaga';
import { watchSceneSaga } from '../state/scene/watchSceneSaga';
import { watchSimCommandsSaga } from '../state/sim/watchSimCommandsSaga';
import { watchPreviewPackedSaga } from '../state/view/watchPreviewPackedSaga';

export function* mainSaga() {
  yield* all([
    watchCatalogSaga(),
    watchSceneSaga(),
    watchSimCommandsSaga(),
    watchExportSaga(),
    watchPreviewPackedSaga(),
    watchHistogramSaga(),
  ]);
}
