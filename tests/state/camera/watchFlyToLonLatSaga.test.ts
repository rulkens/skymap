/**
 * watchFlyToLonLatSaga — the put sequence: a focus switch only for another body,
 * always BEFORE the tween (the follow rows must see the new body when the tween
 * lands), and a tween aimed at the body's centre (the absolute-arm invariant).
 * Where the camera ends up is `tests/services/engine/frame/flyToLonLatLands.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { runSaga, stdChannel } from 'redux-saga';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFlyToLonLatSaga } from '../../../src/state/camera/watchFlyToLonLatSaga';
import { flyToLonLat } from '../../../src/state/camera/flyToLonLatActions';
import type { FlyToLonLatPayload } from '../../../src/state/camera/flyToLonLatActions';
import { startCameraTween } from '../../../src/state/camera/cameraSlice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { setSimDays, pause } from '../../../src/state/time/timeSlice';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { FLY_TO_LON_LAT_TWEEN_MS } from '../../../src/data/camera/flyToLonLatTweenMs';
import { EARTH_REF } from '../../../src/data/selection/earthRef';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../../src/@types/camera/CameraTweenDescriptor';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { LiveCameraRuntime } from '../../../src/store/types';

const BODIES = deriveBodyStates(CONST_J2000);
const EARTH_POS = BODIES.get('earth')!.positionMpc;
// About eleven Earth radii out, looking at Earth.
const FROM: CameraPose = { target: [...EARTH_POS], yaw: 0.3, pitch: 0.1, distance: 2.3e-15 };

function run(payload: FlyToLonLatPayload, runtime: LiveCameraRuntime | null = liveRuntime()) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(setSimDays({ simDays: CONST_J2000, nowMs: 0 }));
  store.dispatch(pause({ nowMs: 0 }));
  store.dispatch(updateSelectionFocus(EARTH_REF));
  const channel = stdChannel();
  const puts: UnknownAction[] = [];
  runSaga(
    {
      channel,
      dispatch: (a: UnknownAction) => puts.push(a),
      getState: store.getState,
      context: { cameraRuntime: () => runtime },
    },
    watchFlyToLonLatSaga,
  );
  channel.put(flyToLonLat(payload));
  return puts;
}

function liveRuntime(): LiveCameraRuntime {
  return { from: FROM, fovYRad: Math.PI / 3, upBasisQuat: [0, 0, 0, 1] };
}

function tweenOf(a: UnknownAction | undefined): CameraTweenDescriptor {
  expect(startCameraTween.match(a!)).toBe(true);
  return (a as ReturnType<typeof startCameraTween>).payload;
}

describe('watchFlyToLonLatSaga', () => {
  it('over the focused body: tweens from the live pose to its centre, focus untouched', () => {
    const puts = run({ lonDeg: 10, latDeg: 20, altKm: 900 });
    expect(puts).toHaveLength(1);
    const tween = tweenOf(puts[0]);
    expect(tween.from).toBe(FROM);
    expect(tween.to.target).toEqual([...EARTH_POS]);
    expect(tween.durationMs).toBe(FLY_TO_LON_LAT_TWEEN_MS);
  });

  it('over another body: focuses it first, then tweens to its centre', () => {
    const puts = run({ body: 'mars' as BodyId, lonDeg: 0, latDeg: 0, durationMs: 250 });
    expect(puts[0]).toEqual(updateSelectionFocus({ type: 'body', id: 'mars' }));
    const tween = tweenOf(puts[1]);
    expect(tween.to.target).toEqual([...BODIES.get('mars')!.positionMpc]);
    expect(tween.durationMs).toBe(250);
  });

  it('does nothing before the camera exists', () => {
    expect(run({ lonDeg: 10, latDeg: 20 }, null)).toEqual([]);
  });
});
