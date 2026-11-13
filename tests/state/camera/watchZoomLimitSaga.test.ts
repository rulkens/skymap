/**
 * watchZoomLimitSaga — a sky wheel-out push plays the arm's lift under the orientation the store
 * holds; a floor push starts nothing yet.
 */
import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchZoomLimitSaga } from '../../../src/state/camera/watchZoomLimitSaga';
import { zoomLimitPushed } from '../../../src/state/camera/zoomLimitPushed';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { ClipData } from '../../../src/@types/animation/ClipData';

const LIFT: ClipData = { start: 'live', timeline: [] };

function build() {
  const sagas = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagas),
  });
  sagas.run(watchZoomLimitSaga);
  store.dispatch(setOrientation('galactic'));
  return store;
}

describe('watchZoomLimitSaga', () => {
  it("an out push plays its lift under the store's orientation", () => {
    const store = build();
    store.dispatch(zoomLimitPushed({ edge: 'out', lift: LIFT }));
    expect(store.getState().camera.intent.clip).toEqual({ data: LIFT, frame: 'galactic' });
  });

  it('a floor push starts nothing', () => {
    const store = build();
    store.dispatch(
      zoomLimitPushed({
        edge: 'in',
        body: asSceneBodyId('earth'),
        pointLocalM: [6_371_000, 0, 0],
      }),
    );
    expect(store.getState().camera.intent.clip).toBeNull();
  });
});
