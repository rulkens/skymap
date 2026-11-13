/**
 * watchZoomLimitSaga — a sky wheel-out push plays the arm's lift under the orientation the store
 * holds; a floor push enters sky mode unless a show runs; Leave while standing with no takeover
 * queues the lift-off step.
 */
import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchZoomLimitSaga } from '../../../src/state/camera/watchZoomLimitSaga';
import { zoomLimitPushed } from '../../../src/state/camera/zoomLimitPushed';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { enterSky } from '../../../src/state/sky/enterSky';
import { exitTakeover, takeoverStarted } from '../../../src/state/takeover/takeoverActions';
import { skyViewReported } from '../../../src/state/sky/skySlice';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { Action, Middleware } from '@reduxjs/toolkit';

const LIFT: ClipData = { start: 'live', timeline: [] };

const SPOT = { body: asSceneBodyId('earth'), lonRad: 0, latRad: 0 };

function build() {
  const sagas = createSagaMiddleware();
  const seen: Action[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    seen.push(action as Action);
    return next(action);
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagas).concat(recorder),
  });
  sagas.run(watchZoomLimitSaga);
  store.dispatch(setOrientation('galactic'));
  return Object.assign(store, { seen });
}

describe('watchZoomLimitSaga', () => {
  it("an out push plays its lift under the store's orientation", () => {
    const store = build();
    store.dispatch(zoomLimitPushed({ edge: 'out', lift: LIFT }));
    expect(store.getState().camera.intent.clip).toEqual({ data: LIFT, frame: 'galactic' });
  });

  it('a floor push enters sky mode at its anchor', () => {
    const store = build();
    store.dispatch(
      zoomLimitPushed({ edge: 'in', body: SPOT.body, pointLocalM: [6_371_000, 0, 0] }),
    );
    expect(store.seen).toContainEqual(enterSky({ spot: SPOT, pointLocalM: [6_371_000, 0, 0] }));
  });

  it('a floor push during a show does not enter', () => {
    const store = build();
    store.dispatch(takeoverStarted({ kind: 'tour', id: 'grandTour' }));
    store.dispatch(
      zoomLimitPushed({ edge: 'in', body: SPOT.body, pointLocalM: [6_371_000, 0, 0] }),
    );
    expect(store.seen.map((a) => a.type)).not.toContain(enterSky.type);
  });

  it('Leave while standing with no takeover lifts off', () => {
    const store = build();
    store.dispatch(skyViewReported({ spot: SPOT, azimuthRad: 0 }));
    store.dispatch(exitTakeover({ restore: true }));
    expect(store.getState().input.pending).toEqual([{ kind: 'liftOff' }]);
  });

  it('a plain exit, or Leave while not standing, queues nothing', () => {
    const store = build();
    store.dispatch(exitTakeover({ restore: true }));
    store.dispatch(skyViewReported({ spot: SPOT, azimuthRad: 0 }));
    store.dispatch(exitTakeover());
    expect(store.getState().input.pending).toEqual([]);
  });
});
