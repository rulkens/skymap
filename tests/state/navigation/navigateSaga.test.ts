/**
 * navigateSaga — over a real store with the selection and focus-tween watchers
 * running, so the counts below are every camera commit and tween a navigation
 * causes, not just the ones the saga dispatches itself.
 */

import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware, { eventChannel } from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

vi.mock('../../../src/services/url/readHashBody', () => ({ readHashBody: vi.fn(() => '') }));
vi.mock('../../../src/services/url/createHashChangeChannel', () => ({
  createHashChangeChannel: vi.fn(),
}));

import { readHashBody } from '../../../src/services/url/readHashBody';
import { createHashChangeChannel } from '../../../src/services/url/createHashChangeChannel';
import { rootReducer } from '../../../src/store/rootReducer';
import { navigateSaga } from '../../../src/state/navigation/navigateSaga';
import { watchHashReadSaga } from '../../../src/state/url/watchHashReadSaga';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { watchRequestFocusSaga } from '../../../src/state/selection/watchRequestFocusSaga';
import { watchRequestSelectSaga } from '../../../src/state/selection/watchRequestSelectSaga';
import { watchSelectionRowsSaga } from '../../../src/state/selectionRows/watchSelectionRowsSaga';
import { commitCameraPose, startCameraTween } from '../../../src/state/camera/cameraSlice';
import { setSimDays } from '../../../src/state/time/timeSlice';
import { selectFocusRef } from '../../../src/state/selection/selectors';
import { selectArrival } from '../../../src/state/arrival/selectors';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { worldArmOf } from '../../fixtures/worldArmOf';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { LinkIntent } from '../../../src/@types/url/LinkIntent';
import type { Transition } from '../../../src/@types/navigation/Transition';

const flush = () => new Promise((r) => setTimeout(r, 0));

const resolveDeps = (): ResolveDeps =>
  ({
    structures: { byId: () => null, byCategory: () => [], loaded: () => true },
  }) as unknown as ResolveDeps;

function build() {
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
  mw.setContext({
    resolveDeps,
    selection: composeSelectionRows(
      () => [...coreSelectionRows(resolveDeps), milkyWaySelectionRow()],
      () => ALL_KINDS_ENABLED,
    ),
    cameraRuntime: () => ({
      from: { target: [0, 0, 0], yaw: 0.5, pitch: -0.2, distance: 9 },
      fovYRad: 0.8,
      aspect: 16 / 9,
      upBasisQuat: [0, 0, 0, 1],
    }),
    home: { focus: null, seedSelection: false },
  });
  for (const saga of [
    watchSelectionRowsSaga,
    watchRequestFocusSaga,
    watchRequestSelectSaga,
    watchFocusTweenSaga,
  ]) {
    mw.run(saga);
  }
  const count = (match: (a: Action) => boolean) => recorded.filter(match).length;
  return {
    store,
    recorded,
    navigate: (intent: LinkIntent, transition: Transition) =>
      mw.run(navigateSaga, intent, transition).toPromise(),
    commits: () => count(commitCameraPose.match),
    tweens: () => count(startCameraTween.match),
    run: mw.run,
  };
}

const POSE = absoluteArm({ target: [1, 2, 3], yaw: 0.5, pitch: -0.25, distance: 4 });

describe('navigateSaga', () => {
  it('navigate focus cut commits once and never tweens', async () => {
    const h = build();
    await h.navigate({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID } }, 'cut');
    await flush();

    expect(h.commits()).toBe(1);
    expect(h.tweens()).toBe(0);
    expect(worldArmOf(h.store.getState().camera.base).distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
  });

  it('navigate focus fly tweens as today', async () => {
    const h = build();
    await h.navigate({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID } }, 'fly');
    await flush();

    expect(h.commits()).toBe(0);
    expect(h.tweens()).toBe(1);
  });

  it('navigate focus+pose commits the pose and never tweens', async () => {
    const h = build();
    await h.navigate({ view: { kind: 'focus', id: MILKY_WAY_FOCUS_ID, pose: POSE } }, 'fly');
    await flush();

    expect(h.commits()).toBe(1);
    expect(h.tweens()).toBe(0);
    expect(h.store.getState().camera.base).toEqual(POSE);
    expect(selectFocusRef(h.store.getState())).toEqual({ type: 'milkyWay' });
  });

  it('navigate pose commits with no focus', async () => {
    const h = build();
    await h.navigate({ view: { kind: 'pose', pose: POSE } }, 'cut');
    await flush();

    expect(h.commits()).toBe(1);
    expect(h.tweens()).toBe(0);
    expect(selectFocusRef(h.store.getState())).toBeNull();
  });

  it('navigate applies t before framing', async () => {
    const h = build();
    const t = Date.UTC(1990, 0, 1);
    await h.navigate({ view: { kind: 'focus', id: 'body-mars' }, t }, 'cut');
    await flush();

    const types = h.recorded.map((a) => a.type);
    expect(types.indexOf(setSimDays.type)).toBeLessThan(types.indexOf(commitCameraPose.type));
    // Mars where it was at `t`: the live clock would put it elsewhere entirely.
    const marsAtT = deriveBodyStates(unixMsToJulianDays(t)).get('mars')!.positionMpc;
    const target = worldArmOf(h.store.getState().camera.base).target;
    expect(target[0]).toBeCloseTo(marsAtT[0], 12);
    expect(target[1]).toBeCloseTo(marsAtT[1], 12);
    expect(target[2]).toBeCloseTo(marsAtT[2], 12);
  });

  it('a hashchange after arrival flies and leaves arrival untouched', async () => {
    vi.mocked(readHashBody).mockReturnValue('');
    let emit = (_body: string) => {};
    vi.mocked(createHashChangeChannel).mockReturnValue(
      eventChannel<string>((emitter) => {
        emit = emitter;
        return () => {};
      }),
    );
    const h = build();
    h.run(watchHashReadSaga);
    const arrival = selectArrival(h.store.getState());
    expect(arrival.status).not.toBe('pending');

    emit(`focus=${MILKY_WAY_FOCUS_ID}`);
    await flush();

    expect(h.tweens()).toBe(1);
    expect(selectArrival(h.store.getState())).toBe(arrival);
  });
});
