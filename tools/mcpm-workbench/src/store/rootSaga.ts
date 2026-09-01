/**
 * rootSaga — composes every feature watcher saga, mirroring `src/store/rootSaga.ts`.
 */
import { all } from 'typed-redux-saga';

import { watchCatalogSaga } from '../state/catalog/watchCatalogSaga';
import { watchExportSaga } from '../state/export/watchExportSaga';
import { watchHistogramSaga } from '../state/histogram/watchHistogramSaga';
import { watchSceneSaga } from '../state/scene/watchSceneSaga';
import { watchSimCommandsSaga } from '../state/sim/watchSimCommandsSaga';
import { watchPaletteSaga } from '../state/view/watchPaletteSaga';
import { watchPreviewPackedSaga } from '../state/view/watchPreviewPackedSaga';

export function* mainSaga() {
  yield* all([
    watchCatalogSaga(),
    watchSceneSaga(),
    watchSimCommandsSaga(),
    watchExportSaga(),
    watchPreviewPackedSaga(),
    watchPaletteSaga(),
    watchHistogramSaga(),
  ]);
}
