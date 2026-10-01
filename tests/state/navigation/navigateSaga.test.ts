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
import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { openExhibit } from '../../../src/state/exhibits/exhibitActions';
import { startTour } from '../../../src/state/tour/tourActions';
import { startClip, stopClip } from '../../../src/state/camera/clipActions';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import {
  clipStarted,
  commitCameraPose,
  startCameraTween,
} from '../../../src/state/camera/cameraSlice';
import { setSimDays } from '../../../src/state/time/timeSlice';
import {
  selectFocusRef,
  selectPendingFocusId,
  selectSelectedRef,
} from '../../../src/state/selection/selectors';
import { selectArrival } from '../../../src/state/arrival/selectors';
import { arrived } from '../../../src/state/arrival/arrivalSlice';
import { coreSelectionRows } from '../../../src/services/engine/selection/coreSelectionRows';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { MILKY_WAY_VIEW_DISTANCE_MPC } from '../../../src/data/milkyWay/galacticCenter';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { sphereFitDistance } from '../../../src/utils/camera/sphereFitDistance';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
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

const PLAYS = [
  ['tour', 'grandTour', startTour.match],
  ['clip', 'cosmicFlows', startClip.match],
] as const;

const CLIP_STARTED: Parameters<typeof clipStarted>[0] = {
  data: { timeline: [] },
  frame: 'equatorial',
};

// `playsAtOnce` stands in for a player whose first clip starts inside the
// start request's own dispatch.
function build({ playsAtOnce = false } = {}) {
  const recorded: Action[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    recorded.push(action as Action);
    return next(action);
  };
  const player: Middleware = (api) => (next) => (action) => {
    const result = next(action);
    if (playsAtOnce && (startTour.match(action) || startClip.match(action))) {
      api.dispatch(clipStarted(CLIP_STARTED));
    }
    return result;
  };
  const playClip = vi.fn(() => new Promise<void>(() => {}));
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(recorder, player, mw),
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
    playClip,
  });
  for (const saga of [
    watchSelectionRowsSaga,
    watchRequestFocusSaga,
    watchRequestSelectSaga,
    watchFocusTweenSaga,
    watchTakeoverSaga,
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
    count,
    playClip,
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
  });

  it('navigate exhibit cut commits the fitted pose and plays no clip', async () => {
    const h = build();
    const outcome = await h.navigate(
      { view: { kind: 'exhibit', id: 'observableUniverse' } },
      'cut',
    );
    await flush();

    expect(outcome).toEqual({ ok: true });
    expect(h.playClip).not.toHaveBeenCalled();
    expect(h.commits()).toBe(1);
    const { fitRadiusMpc } = exhibitRegistry.observableUniverse;
    expect(worldArmOf(h.store.getState().camera.base).distance).toBe(
      sphereFitDistance(fitRadiusMpc!, 0.8, 16 / 9),
    );
    expect(selectTakeoverSource(h.store.getState())).toEqual({
      kind: 'exhibit',
      id: 'observableUniverse',
      entry: 'cut',
    });
  });

  it('exhibit link selects nothing even with a focus key', async () => {
    const h = build();
    await h.navigate(linkIntentFrom(`exhibit=cosmicWeb&focus=${MILKY_WAY_FOCUS_ID}`), 'cut');
    await flush();

    const state = h.store.getState();
    expect(selectFocusRef(state)).toBeNull();
    expect(selectSelectedRef(state)).toBeNull();
    expect(selectPendingFocusId(state)).toBeNull();
    expect(h.tweens()).toBe(0);
  });

  it.each([
    ['exhibit', openExhibit.match],
    ['tour', startTour.match],
    ['clip', startClip.match],
  ] as const)('an unknown %s id fails without dispatching its start', async (kind, started) => {
    const h = build();
    const outcome = await h.navigate({ view: { kind, id: 'nope' } }, 'cut');

    expect(outcome).toEqual({ ok: false, reason: 'unknown-id' });
    expect(h.count(started)).toBe(0);
    expect(selectTakeoverSource(h.store.getState())).toBeNull();
  });

  it.each(PLAYS)('navigate %s reveals after the first clipStarted', async (kind, id, started) => {
    const h = build();
    let done = false;
    const navigation = h.navigate({ view: { kind, id } }, 'cut').then((outcome) => {
      done = true;
      return outcome;
    });
    await flush();

    expect(h.count(started)).toBe(1);
    expect(done).toBe(false);

    h.store.dispatch(clipStarted(CLIP_STARTED));
    expect(await navigation).toEqual({ ok: true });
  });

  it.each(PLAYS)('navigate %s catches a clipStarted inside its start', async (kind, id) => {
    // A player whose first clip starts inside the start request's dispatch
    // must still reveal, not leave the arrival waiting for the timeout.
    const h = build({ playsAtOnce: true });
    const outcome = await Promise.race([
      h.navigate({ view: { kind, id } }, 'cut'),
      flush().then(() => 'still waiting'),
    ]);

    expect(outcome).toEqual({ ok: true });
  });

  it.each([
    ['tour', 'grandTour', exitTakeover.match],
    ['clip', 'cosmicFlows', stopClip.match],
  ] as const)('a cancelled %s arrival stops what it started', async (kind, id, stopped) => {
    const h = build();
    const task = h.run(navigateSaga, { view: { kind, id } }, 'cut' as const);
    await flush();
    task.cancel();
    await flush();

    expect(h.count(stopped)).toBe(1);
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
    h.store.dispatch(arrived());
    const arrival = selectArrival(h.store.getState());

    emit(`focus=${MILKY_WAY_FOCUS_ID}`);
    await flush();

    expect(h.tweens()).toBe(1);
    expect(selectArrival(h.store.getState())).toBe(arrival);
  });
});
