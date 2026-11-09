/**
 * B1: a double-tap's focus fly must survive its own second press. The second
 * press's `inputGestureStarted` clears any tween, so it has to reach the store
 * before the fly starts. Standing, the double-tap only ever turns the head, for every
 * kind: what it cannot look at stays selected and nothing flies (owner ruling). Real
 * reducer, real focus and view sagas, the canvas source saga over a hand-driven channel.
 */

import { describe, it, expect } from 'vitest';
import createSagaMiddleware, { buffers, eventChannel } from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { inputSourceSaga } from '../../../src/state/input/inputSourceSaga';
import { watchFocusSelectedSaga } from '../../../src/state/selection/watchFocusSelectedSaga';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { watchRequestViewSaga } from '../../../src/state/selection/watchRequestViewSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import {
  updateSelectionFocus,
  updateSelectionSelect,
} from '../../../src/state/selection/selectionSlice';
import { requestView } from '../../../src/state/selection/requestView';
import { engineSkyViewReported } from '../../../src/state/engine/engineSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { bodySelectionRow } from '../../../src/layers/body/selection/bodySelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../src/layers/zoneOfAvoidance/selection/zoneOfAvoidanceSelectionRow';
import { galaxyCatalogSelectionRow } from '../../../src/layers/galaxyCatalog/selection/galaxyCatalogSelectionRow';
import { Source } from '../../../src/data/source';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { NO_KINDS_OFF } from '../../support/noKindsOff';
import { cameraRoute, selectionRoute } from '../../../src/store/constants';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';
import {
  bodyPickCodes,
  galaxyRowRuntime,
  milkyWayPickCode,
  zoneOfAvoidancePickCode,
} from '../../support/layerPickCodes';
import type { GalaxyRowFixture } from '../../support/selectionResolverOver';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';

installAppSelectionKinds();

const settle = () => new Promise((r) => setTimeout(r, 0));
const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const AT = { x: 0.5, y: 0.5 };
const EARTH = asSceneBodyId('earth');
const GALAXIES = {
  catalogs: new Map([
    [Source.SDSS, makeGalaxyCatalog(1, { positions: new Float32Array([90, 0, 40]) })],
  ]),
} as unknown as GalaxyRowFixture;

function build() {
  const seen: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push(action as UnknownAction);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g({ serializableCheck: false }).concat(record, mw),
  });
  mw.setContext({
    selection: composeSelectionRows(
      () => [
        bodySelectionRow({ pickCodes: bodyPickCodes() }),
        milkyWaySelectionRow(milkyWayPickCode()),
        zoneOfAvoidanceSelectionRow(zoneOfAvoidancePickCode()),
        galaxyCatalogSelectionRow(galaxyRowRuntime(GALAXIES)),
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
  mw.run(watchRequestViewSaga);
  mw.run(watchRequestFocusSaga);

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

  const stand = (store: ReturnType<typeof build>['store']) => {
    store.dispatch(updateSelectionFocus({ type: 'body', id: EARTH }, 'cut'));
    store.dispatch(
      engineSkyViewReported({
        spot: { body: EARTH, lonRad: 0.2186, latRad: 0.9716 },
        azimuthRad: 0,
        altitudeRad: 0.3,
      }),
    );
  };

  it.each([
    ['the Milky Way', { type: 'milkyWay' }, 'milkyWay'],
    ['a galaxy', { type: 'galaxyCatalog', source: Source.SDSS, index: 0 }, 'sdss-1'],
  ])('standing, a double-tap on %s turns the head as a search pick does', async (_, ref, id) => {
    const { store, seen, doubleTap } = build();
    stand(store);
    store.dispatch(updateSelectionSelect(ref));
    await doubleTap();

    expect(seen.find(requestView.match)?.payload).toEqual({ id });
    expect(seen.some(clipStarted.match)).toBe(true);
    expect(seen.some(requestFocus.match)).toBe(false);
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: EARTH });
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });

  // The ground underfoot is also what a double-click too quick for its own pick reads.
  it.each([
    ['the zone of avoidance (no place in the sky)', { type: 'zoneOfAvoidance' }],
    ['the ground underfoot', { type: 'body', id: EARTH }],
  ])('standing, a double-tap on %s only selects: nothing flies', async (_, ref) => {
    const { store, seen, doubleTap } = build();
    stand(store);
    store.dispatch(updateSelectionSelect(ref));
    await doubleTap();

    expect(seen.some(requestFocus.match)).toBe(false);
    expect(seen.some(clipStarted.match)).toBe(false);
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'body', id: EARTH });
    expect(store.getState()[selectionRoute].select).toEqual(ref);
    expect(store.getState()[cameraRoute].tween).toBeNull();
  });
});
