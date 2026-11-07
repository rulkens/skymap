import { describe, expect, it } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchEnterSkyHereSaga } from '../../../src/state/sky/watchEnterSkyHereSaga';
import { enterSkyHere } from '../../../src/state/sky/enterSkyHere';
import { enterSky } from '../../../src/state/sky/enterSky';
import { engineSkyEntryReported } from '../../../src/state/engine/engineSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };
const POINT: Vec3 = [3_500_000, 780_000, 5_260_000];

function build() {
  const seen: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const sagas = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g({ serializableCheck: false }).concat(record, sagas),
  });
  sagas.run(watchEnterSkyHereSaga);
  return { store, seen };
}

describe('watchEnterSkyHereSaga', () => {
  it('enters at the centre ground, with its point, while entry is on offer', () => {
    const { store, seen } = build();
    store.dispatch(engineSkyEntryReported({ spot: SPOT, pointLocalM: POINT, altitudeM: 5_000 }));
    store.dispatch(enterSkyHere());
    expect(seen.filter(enterSky.match).map((a) => a.payload)).toEqual([
      { spot: SPOT, pointLocalM: POINT },
    ]);
  });

  it('does nothing once entry is off (here: above 20 km)', () => {
    const { store, seen } = build();
    store.dispatch(engineSkyEntryReported({ spot: SPOT, pointLocalM: POINT, altitudeM: 25_000 }));
    store.dispatch(enterSkyHere());
    expect(seen.some(enterSky.match)).toBe(false);
  });
});
