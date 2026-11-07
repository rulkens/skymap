/**
 * B1: a double-tap's focus fly must survive its own second press. The second
 * press's `inputGestureStarted` clears any tween, so it has to reach the store
 * before the fly starts. Standing, the double-tap asks for the view as search does
 * and flies nothing. Real reducer, real focus sagas, the canvas source saga over a
 * hand-driven channel.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware, { buffers, eventChannel } from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { inputSourceSaga } from '../../../src/state/input/inputSourceSaga';
import { watchFocusSelectedSaga } from '../../../src/state/selection/watchFocusSelectedSaga';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { requestView } from '../../../src/state/selection/requestView';
import { engineSkyViewReported } from '../../../src/state/engine/engineSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { bodySelectionRow } from '../../../src/layers/body/selection/bodySelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { NO_KINDS_OFF } from '../../support/noKindsOff';
import { cameraRoute, selectionRoute } from '../../../src/store/constants';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';
import { bodyPickCodes, milkyWayPickCode } from '../../support/layerPickCodes';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';

installAppSelectionKinds();

const settle = () => new Promise((r) => setTimeout(r, 0));
const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const AT = { x: 0.5, y: 0.5 };

function build() {
  const seen: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(record, mw),
  });
  mw.setContext({
    selection: composeSelectionRows(
      () => [
        bodySelectionRow({ pickCodes: bodyPickCodes() }),
        milkyWaySelectionRow(milkyWayPickCode()),
      ],
      () => NO_KINDS_OFF,
    ),
    cameraRuntime: () => ({
      from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 9 },
      fovYRad: 0.8,
      aspect: 2,
      upBasisQuat: [0, 0, 0, 1],
    }),
  });
  mw.run(watchFocusSelectedSaga);
  mw.run(watchFocusTweenSaga);

  let emit!: (e: DeviceEvent) => void;
  const channel = eventChannel<DeviceEvent>((e) => {
    emit = e;
    return () => {};
  }, buffers.expanding());
  mw.run(() => inputSourceSaga('canvas', channel));

  const doubleTap = async () => {
    emit({ kind: 'resize', t: 0, widthPx: 200, heightPx: 100 });
    let t = 0;
    for (const kind of ['down', 'up', 'down', 'up'] as const) {
      const ev = { pointer: 1, pointerType: 'mouse', button: 0, at: AT, mods: NO_MODS } as const;
      emit({ kind, t: (t += 50), ...ev });
    }
    await settle();
  };
  return { store, seen, doubleTap };
}

describe('double-tap focus', () => {
  it('press, release, press, release on a selected galaxy: the focus tween started by the double-tap survives', async () => {
    const { store, doubleTap } = build();
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await doubleTap();

    expect(store.getState()[cameraRoute].tween).not.toBeNull();
  });

  it('standing, a double-tap asks for the view as a search pick does and flies nothing', async () => {
    const { store, seen, doubleTap } = build();
    store.dispatch(
      engineSkyViewReported({
        spot: { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 },
        azimuthRad: 0,
        altitudeRad: 0.3,
      }),
    );
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await doubleTap();

    expect(seen.find(requestView.match)?.payload).toEqual({ id: 'milkyWay' });
    expect(store.getState()[selectionRoute].focus).toBeNull();
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });
});
