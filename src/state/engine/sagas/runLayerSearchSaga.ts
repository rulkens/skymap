/**
 * runLayerSearchSaga — one Layer's `search` feed, published under its name.
 * A static feed ends after one yield and its rows must stay, so the task parks
 * rather than returning: a finished task ignores `cancel()`, and teardown's
 * cancel is the one edge that clears the rows (or an engine re-create would
 * leave the old snapshot beside the new one).
 */

import { call, cancelled, put } from 'typed-redux-saga';
import type { SagaIterator } from 'redux-saga';

import { runLayerFeedSaga } from './runLayerFeedSaga';
import { layerSearchCleared, layerSearchReported } from '../engineSlice';
import type { LayerSearchEntry } from '../../../@types/engine/layer/LayerSearchEntry';

export function* runLayerSearchSaga(
  layer: string,
  feed: AsyncIterable<readonly LayerSearchEntry[]>,
): SagaIterator {
  try {
    yield* runLayerFeedSaga(feed, (rows) => put(layerSearchReported({ layer, rows })));
    yield* call(() => new Promise<never>(() => {}));
  } finally {
    if (yield* cancelled()) yield* put(layerSearchCleared({ layer }));
  }
}
