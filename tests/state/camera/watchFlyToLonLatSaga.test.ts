/**
 * watchFlyToLonLatSaga — the instrument commits a BODY arm (spec §9): the
 * standpoint it was asked for, at the altitude and heading the camera already
 * had, in either arm and on either side of the engage band. The out-of-band
 * half of the story — the fold converting that arm back — is
 * `tests/services/engine/frame/poseFold.test.ts`.
 */
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
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { bodyFixedEyeM } from '../../../src/utils/camera/bodyFixedEyeM';
import { eyeFrameOf } from '../../../src/utils/camera/eyeFrameOf';
import { directionToLonLatDeg } from '../../../src/utils/scene/directionToLonLatDeg';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { BODY_LOCAL_FRAME } from '../../../src/data/camera/bodyLocalFrame';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { cameraRoute } from '../../../src/store/constants';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const flush = () => new Promise((r) => setTimeout(r, 0));

// Off-epoch instant (mirrors the deleted flyToLonLatPose.test.ts's SIM_DAYS) so
// Earth's derived position isn't the degenerate J2000 special case.
const SIM_DAYS = CONST_J2000 + 9727.95;
const EARTH = SCENE_EARTH.id as BodyId;
const R = SCENE_EARTH.radiusM;

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
    // Equatorial, whose basis is exact: the galactic literals are 6-decimal, so
    // its columns are unit only to ~2e-7 and a nominal-altitude assertion would
    // measure that rounding (metres, at these ranges) instead of the saga.
    store.dispatch(setOrientation('equatorial'));
    // Freeze the sim clock at a specific off-epoch instant, nowMs-independent.
    store.dispatch(setSimDays({ simDays: SIM_DAYS, nowMs: 0 }));
    store.dispatch(pause({ nowMs: 0 }));
  });

  /** An absolute base looking at Earth's centre from `altitudeM` up. */
  function commitOrbitAt(altitudeM: number) {
    const earthState = deriveBodyStates(SIM_DAYS).get(EARTH)!;
    store.dispatch(
      commitCameraPose(
        absoluteArm({
          target: [...earthState.positionMpc] as Vec3,
          yaw: 0.4,
          pitch: -0.2,
          distance: (R + altitudeM) * SCALE_UNITS.M_TO_MPC,
        }),
      ),
    );
  }

  function committedArm(): { frame: unknown; pose: BodyFixedPose } {
    const base = store.getState()[cameraRoute].base;
    expect(base.frame).toEqual({ body: EARTH });
    return base as { frame: unknown; pose: BodyFixedPose };
  }

  it('commits a body arm standing over the requested lon/lat, at the altitude it had', async () => {
    const altitudeM = 900_000;
    commitOrbitAt(altitudeM);

    store.dispatch(flyToLonLat({ lonDeg: 10, latDeg: 20 }));
    await flush();

    const eyeM = bodyFixedEyeM(committedArm().pose);
    const standpoint = directionToLonLatDeg(normalize3(eyeM));
    expect(standpoint.lonDeg).toBeCloseTo(10, 6);
    expect(standpoint.latDeg).toBeCloseTo(20, 6);
    expect((Math.hypot(...eyeM) - R) / altitudeM).toBeCloseTo(1, 8);
  });

  it('carries the heading it flew with', async () => {
    store.dispatch(
      commitCameraPose({
        frame: { body: EARTH },
        pose: lonLatFocusPose({ lonDeg: -30, latDeg: 12 }, EARTH, R, 800_000, 1.1),
      }),
    );

    store.dispatch(flyToLonLat({ lonDeg: 10, latDeg: 20 }));
    await flush();

    const frame = eyeFrameOf(committedArm().pose, 1, BODY_LOCAL_FRAME.pole)!;
    expect(frame.azimuthRad).toBeCloseTo(1.1, 6);
    expect(frame.tiltRad).toBeCloseTo(0, 6);
  });

  it('authors the body arm from outside the band too — the fold reconciles', async () => {
    const altitudeM = 4 * R; // h/R = 4, an order above the tuning's disengageHR
    commitOrbitAt(altitudeM);

    store.dispatch(flyToLonLat({ lonDeg: 10, latDeg: 20 }));
    await flush();

    expect((Math.hypot(...bodyFixedEyeM(committedArm().pose)) - R) / altitudeM).toBeCloseTo(1, 8);
  });
});
