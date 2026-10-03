/**
 * arrivalSaga — over a real store with the selection and focus-tween watchers
 * running. The camera runtime starts absent and appears the way `wireInput`
 * brings it up (runtime first, then the boot base commit), so every case
 * also covers the arrival waiting for the engine.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

vi.mock('../../../src/services/animation/afterTwoFrames', () => ({
  afterTwoFrames: () => Promise.resolve(),
}));
// The frame loop's non-camera stages, which the sim harness's stub state cannot feed.
vi.mock('../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { rootReducer } from '../../../src/store/rootReducer';
import { arrivalSaga } from '../../../src/state/arrival/arrivalSaga';
import { arrivalPending } from '../../../src/state/arrival/arrivalSlice';
import { selectArrival } from '../../../src/state/arrival/selectors';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../../../src/state/selection/watchRequestSelectSaga';
import { watchSelectionRowsSaga } from '../../../src/state/selectionRows/watchSelectionRowsSaga';
import { commitCameraPose, startCameraTween } from '../../../src/state/camera/cameraSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { selectFocusRef, selectSelectedRef } from '../../../src/state/selection/selectors';
import {
  engineLoadProgressChanged,
  engineStatusChanged,
} from '../../../src/state/engine/engineSlice';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { foldToWorld } from '../../../src/services/engine/camera/rungs/foldToWorld';
import { ARRIVAL_TIMEOUT_MS } from '../../../src/data/arrival/arrivalTimeoutMs';
import { EARTH_HOME } from '../../../src/data/selection/earthHome';
import { EARTH_REF } from '../../../src/data/selection/earthRef';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/datumOnlyTerrainHeight';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { worldArmOf } from '../../fixtures/worldArmOf';
import { homePose } from '../../../src/services/engine/camera/homePose';
import { makeCameraSimHarness } from '../../helpers/camera/makeCameraSimHarness';
import { seedCameraRuntime } from '../../../src/services/engine/camera/seedCameraRuntime';
import { selectOrientation } from '../../../src/state/settings/selectors';
import { deriveSimDays } from '../../../src/utils/time/deriveSimDays';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LinkIntent } from '../../../src/@types/url/LinkIntent';
import type { LiveCameraRuntime } from '../../../src/store/types';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../src/@types/scene/BodyState';

const flush = () => new Promise((r) => setTimeout(r, 0));

const resolveDeps = (): ResolveDeps =>
  ({
    structures: { byId: () => null, byCategory: () => [], loaded: () => true },
  }) as unknown as ResolveDeps;

const LIVE: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 },
  fovYRad: 0.8,
  aspect: 1,
  upBasisQuat: [0, 0, 0, 1],
};
const BOOT_BASE = absoluteArm({ target: [0, 0, 0], yaw: 0.5, pitch: -0.2, distance: 9 });
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const PROJECTION = { fovYRad: LIVE.fovYRad, aspect: 1, near: 1e-20, far: 1e5 };

function build({ milkyWayLanded = true, home = EARTH_HOME } = {}) {
  const recorded: Action[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    recorded.push(action as Action);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(recorder, mw),
  });
  let booted = false;
  const layerRows = { landed: milkyWayLanded };
  mw.setContext({
    resolveDeps,
    selection: composeSelectionRows(
      () => [
        ...coreSelectionRows(resolveDeps),
        ...(layerRows.landed ? [milkyWaySelectionRow()] : []),
      ],
      () => ALL_KINDS_ENABLED,
    ),
    cameraRuntime: () => (booted ? LIVE : null),
    home,
  });
  for (const saga of [
    watchSelectionRowsSaga,
    watchRequestFocusSaga,
    watchRequestSelectSaga,
    watchFocusTweenSaga,
    arrivalSaga,
  ]) {
    mw.run(saga);
  }
  const count = (match: (a: Action) => boolean) => recorded.filter(match).length;
  return {
    store,
    recorded,
    layerRows,
    arrive: (intent: LinkIntent) => store.dispatch(arrivalPending(intent)),
    // What `wireInput` does: the runtime exists, then the boot base lands.
    boot: () => {
      booted = true;
      store.dispatch(commitCameraPose(BOOT_BASE));
    },
    // Commits after the boot base: the arrival's own.
    arrivalCommits: () => count(commitCameraPose.match) - 1,
    tweens: () => count(startCameraTween.match),
    status: () => selectArrival(store.getState()),
  };
}

describe('arrivalSaga', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('boot arrival on a body commits once, never tweens, then arrives', async () => {
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'body-mars' } });
    await flush();
    expect(h.status().status).toBe('pending');

    h.boot();
    await flush();

    expect(h.arrivalCommits()).toBe(1);
    expect(h.tweens()).toBe(0);
    expect(selectFocusRef(h.store.getState())).toEqual({ type: 'body', id: 'mars' });
    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('a followed body shows no glide at arrival', async () => {
    // The arrival's commit and focus row, replayed in the one tick they land
    // in, into a frame loop that has been drawing the boot base.
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'body-mars' }, t: J2000_MS });
    h.boot();
    await flush();
    const arrival = h.recorded.filter(
      (a) =>
        (commitCameraPose.match(a) && a.payload !== BOOT_BASE) ||
        (setSelectionRow.match(a) && a.payload.slot === 'focus'),
    );
    expect(arrival).toHaveLength(2);

    const sim = makeCameraSimHarness({ focusBody: null, bootHR: null });
    sim.frame(3);
    for (const action of arrival) sim.store.dispatch(action);

    const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
    const bodies = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
    const shown = () =>
      foldToWorld(sim.state.cameraRuntime.outputs.displayed, {
        bodies,
        poseBasis: B,
        upBasis: B,
        terrainHeightAt: datumOnlyTerrainHeight,
      });
    const landed = worldArmOf(h.store.getState().camera.base);
    sim.frame(1);
    const first = shown();
    sim.frame(60);
    const later = shown();

    for (const pose of [first, later]) {
      // Relative: a body framing distance is ~1e-15 Mpc.
      expect(pose.distance / landed.distance).toBeCloseTo(1, 9);
      expect(pose.yaw).toBeCloseTo(landed.yaw, 12);
      expect(pose.pitch).toBeCloseTo(landed.pitch, 12);
    }
  });

  it('boot arrival on a late catalog id waits for the catalog, then arrives', async () => {
    const h = build({ milkyWayLanded: false });
    h.arrive({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID } });
    h.boot();
    await flush();
    expect(h.status().status).toBe('pending');
    expect(h.arrivalCommits()).toBe(0);

    h.layerRows.landed = true;
    h.store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();

    expect(h.arrivalCommits()).toBe(1);
    expect(worldArmOf(h.store.getState().camera.base).distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('an id the loaded catalogs lack fails to home', async () => {
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'pgc-99999999' } });
    h.boot();
    h.store.dispatch(engineStatusChanged({ kind: 'ready', count: 1 }));
    h.store.dispatch(engineLoadProgressChanged(null));
    await flush();
    await flush();

    expect(h.status()).toEqual({ status: 'failed', reason: 'unknown-id' });
    expect(selectFocusRef(h.store.getState())).toEqual(EARTH_REF);
    expect(h.tweens()).toBe(0);
  });

  it('the backstop times out to failed', async () => {
    vi.useFakeTimers();
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'pgc-99999999' } });
    h.boot();
    await vi.advanceTimersByTimeAsync(ARRIVAL_TIMEOUT_MS - 1);
    expect(h.status().status).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);

    expect(h.status()).toEqual({ status: 'failed', reason: 'timeout' });
    expect(selectFocusRef(h.store.getState())).toEqual(EARTH_REF);
  });

  it('a body framed at the linked instant, not wall-clock', async () => {
    const h = build();
    const t = Date.UTC(1990, 0, 1);
    h.arrive({ view: { kind: 'focus', id: 'body-mars' }, t });
    h.boot();
    await flush();

    const marsAtT = deriveBodyStates(unixMsToJulianDays(t)).get('mars')!.positionMpc;
    const target = worldArmOf(h.store.getState().camera.base).target;
    for (const axis of [0, 1, 2]) expect(target[axis]).toBeCloseTo(marsAtT[axis]!, 12);
    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('a plain boot arrives at home with the Earth focus', async () => {
    const h = build();
    h.arrive({ view: { kind: 'home' } });
    h.boot();
    await flush();

    const root = h.store.getState();
    expect(h.arrivalCommits()).toBe(1);
    expect(h.tweens()).toBe(0);
    expect(selectFocusRef(root)).toEqual(EARTH_REF);
    expect(selectSelectedRef(root)).toEqual(EARTH_REF);
    expect(h.status()).toEqual({ status: 'arrived' });
    // Framed against the wall-clock sun: the store's seed anchor is J2000.
    const now = unixMsToJulianDays(Date.now());
    const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
    const expected = worldArmOf(homePose(EARTH_HOME, LIVE.fovYRad, now, B));
    const landed = worldArmOf(root.camera.base);
    expect(landed.yaw).toBeCloseTo(expected.yaw, 3);
    expect(landed.pitch).toBeCloseTo(expected.pitch, 3);
  });

  it('a linked orientation is in the store before the camera runtime is seeded', async () => {
    const h = build();
    h.arrive({ view: { kind: 'home' }, orientation: 'galactic' });
    await flush();
    // What `wireInput` seeds the runtime off; a seed in another frame makes
    // frame 1 re-encode the arrival's already-galactic base.
    const seeded = seedCameraRuntime({ state: h.store.getState(), projection: PROJECTION });
    h.boot();
    await flush();

    const root = h.store.getState();
    expect(seeded.orientation).toBe(selectOrientation(root));
    const simDays = deriveSimDays(root.time, performance.now());
    const expected = worldArmOf(
      homePose(EARTH_HOME, LIVE.fovYRad, simDays, ORIENTATION_FRAMES.galactic),
    );
    const landed = worldArmOf(root.camera.base);
    expect(landed.yaw).toBeCloseTo(expected.yaw, 3);
    expect(landed.pitch).toBeCloseTo(expected.pitch, 3);
  });

  it('a home that does not seed the selection focuses but never selects', async () => {
    const h = build({ home: { ...EARTH_HOME, seedSelection: false } });
    h.arrive({ view: { kind: 'home' } });
    h.boot();
    await flush();

    expect(selectFocusRef(h.store.getState())).toEqual(EARTH_REF);
    expect(selectSelectedRef(h.store.getState())).toBeNull();
    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('a catalog that lands after the arrival timed out does not change focus', async () => {
    vi.useFakeTimers();
    const h = build({ milkyWayLanded: false });
    h.arrive({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID } });
    h.boot();
    await vi.advanceTimersByTimeAsync(ARRIVAL_TIMEOUT_MS);
    expect(h.status()).toEqual({ status: 'failed', reason: 'timeout' });

    h.layerRows.landed = true;
    h.store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(selectFocusRef(h.store.getState())).toEqual(EARTH_REF);
    expect(selectSelectedRef(h.store.getState())).toEqual(EARTH_REF);
  });

  it('a load that starts right after an idle report keeps the arrival pending', async () => {
    const h = build({ milkyWayLanded: false });
    h.arrive({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID } });
    h.boot();
    h.store.dispatch(engineStatusChanged({ kind: 'ready', count: 1 }));
    h.store.dispatch(engineLoadProgressChanged(null));
    h.store.dispatch(
      engineLoadProgressChanged({ loadedBytes: 0, totalBytes: 10, inFlightCount: 1 }),
    );
    await flush();
    expect(h.status().status).toBe('pending');

    h.layerRows.landed = true;
    h.store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();

    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('the backstop waits for the camera to exist', async () => {
    vi.useFakeTimers();
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'body-mars' } });
    await vi.advanceTimersByTimeAsync(ARRIVAL_TIMEOUT_MS * 2);
    expect(h.status().status).toBe('pending');

    h.boot();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.status()).toEqual({ status: 'arrived' });
  });

  it('an engine that errors before the camera exists fails the arrival', async () => {
    const h = build();
    h.arrive({ view: { kind: 'focus', id: 'body-mars' } });
    h.store.dispatch(engineStatusChanged({ kind: 'error', message: 'no adapter' }));
    await flush();

    expect(h.status()).toEqual({ status: 'failed', reason: 'engine-error' });
  });
});
