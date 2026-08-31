import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFlyToLonLatSaga } from '../../../src/state/camera/watchFlyToLonLatSaga';
import { flyToLonLat } from '../../../src/state/camera/flyToLonLatActions';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { lonLatFocusPose } from '../../../src/utils/camera/lonLatFocusPose';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { cameraRoute } from '../../../src/store/constants';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';

const flush = () => new Promise((r) => setTimeout(r, 0));

// Off-epoch instant (mirrors the deleted flyToLonLatPose.test.ts's SIM_DAYS) so
// Earth's derived position isn't the degenerate J2000 special case.
const SIM_DAYS = CONST_J2000 + 9727.95;

describe('watchFlyToLonLatSaga', () => {
  let store: ReturnType<typeof build>;

  function build() {
    const middleware = createSagaMiddleware();
    const created = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(middleware),
    });
    middleware.run(watchFlyToLonLatSaga);
    return created;
  }

  beforeEach(() => {
    store = build();
  });

  it('commits the pose lonLatFocusPose computes from the selected orientation, resting distance, and derived Earth state', async () => {
    const restingPose: CameraPose = { target: [1, 2, 3], yaw: 0.4, pitch: -0.2, distance: 42 };
    store.dispatch(commitCameraPose(restingPose));
    store.dispatch(setOrientation('galactic'));
    // Freeze the sim clock at a specific off-epoch instant, nowMs-independent.
    store.dispatch(setSimDays({ simDays: SIM_DAYS, nowMs: 0 }));
    store.dispatch(pause({ nowMs: 0 }));

    store.dispatch(flyToLonLat({ lonDeg: 10, latDeg: 20 }));
    await flush();

    const earthState = deriveBodyStates(SIM_DAYS).get(SCENE_EARTH.id)!;
    const expected = lonLatFocusPose(
      { lonDeg: 10, latDeg: 20 },
      earthState.positionMpc,
      restingPose.distance,
      earthState.orientation,
      ORIENTATION_FRAMES.galactic,
    );

    expect(store.getState()[cameraRoute].base).toEqual(expected);
  });
});
