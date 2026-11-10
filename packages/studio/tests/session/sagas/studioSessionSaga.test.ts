/**
 * The session saga over a real store with the studio slice injected, the way the takeover body
 * runs it. The selection resolver is the test fixture; for the supersede case it is gated so a
 * revision can be held waiting on its foci.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../../src/store/rootReducer';
import { pause, setSimDays } from '../../../../../src/state/time/timeSlice';
import { selectOrientation } from '../../../../../src/state/settings/selectors';
import { clipFactories } from '../../../../../src/data/animation/clips/clipRegistry';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { all, dollyTo, focus } from '../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../src/utils/animation/focusId';
import { studioSessionSaga } from '../../../src/session/sagas/studioSessionSaga';
import {
  draftResolved,
  paramEdited,
  startModeSet,
  studioOpened,
  undone,
} from '../../../src/session/state/studioSlice';
import { objectPicked } from '../../../src/session/state/objectPicked';
import {
  selectCurrentResolution,
  selectDraft,
  selectIsDirty,
  selectPreview,
  selectRefNames,
  selectRevision,
} from '../../../src/session/state/selectors';
import { refKey } from '../../../../../src/utils/selection/refKey';
import { selectionResolverOver } from '../../../../../tests/support/selectionResolverOver';
import { installAppSelectionKinds } from '../../../../../tests/support/installAppSelectionKinds';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { LiveCameraRuntime } from '../../../../../src/store/types';
import type { SelectionResolver } from '../../../../../src/@types/engine/selection/SelectionResolver';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';

installAppSelectionKinds();

const flush = () => new Promise((r) => setTimeout(r, 0));

const RUNTIME: LiveCameraRuntime = {
  from: { target: [1, 2, 3], yaw: 0.4, pitch: -0.1, distance: 7 },
  fovYRad: 0.9,
  aspect: 16 / 9,
  upBasisQuat: [0, 0, 0, 1],
};
const FIXTURE = selectionResolverOver({ byId: () => null, byCategory: () => [] });
const EDIT_DISTANCE = paramEdited({
  ref: { kind: 'effect', path: [0, 0] },
  param: 'to',
  value: 950,
  label: 'Distance',
  gesture: null,
});

function harness(selection: SelectionResolver = FIXTURE) {
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
  mw.setContext({ selection, cameraRuntime: () => RUNTIME });
  const run = (id: ClipId) => mw.run(studioSessionSaga, id);
  return { store, recorded, run };
}

describe('studioSessionSaga', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the session opens the clip at the frozen instant with the pinned preview', async () => {
    const h = harness();
    // A paused manual clock: the frozen instant is its anchor, whatever nowMs reads.
    const sim = CONST_J2000 + 200;
    h.store.dispatch(setSimDays({ simDays: sim, nowMs: 1000 }));
    h.store.dispatch(pause({ nowMs: 1000 }));

    h.run('earthFlyout');
    await flush();

    const state = h.store.getState();
    // earthFlyout bakes Earth's position at the instant it is built for.
    expect(selectDraft(state)).toEqual(clipFactories.earthFlyout(sim).data);
    expect(selectDraft(state)).not.toEqual(clipFactories.earthFlyout(CONST_J2000).data);
    expect(selectPreview(state)).toEqual({
      startPose: RUNTIME.from,
      simDays: sim,
      frame: selectOrientation(state),
      fovYRad: RUNTIME.fovYRad,
    });
    expect(state.time.paused).toBe(true);
  });

  it('each edit is resolved and tagged with its revision', async () => {
    const h = harness();
    h.run('flyout');
    await flush();

    const opened = selectCurrentResolution(h.store.getState());
    expect(opened?.revision).toBe(selectRevision(h.store.getState()));
    // flyout starts live, so its resolution starts at the pinned pose.
    expect(opened).toMatchObject({ data: { start: RUNTIME.from } });

    h.store.dispatch(EDIT_DISTANCE);
    await flush();

    const edited = selectCurrentResolution(h.store.getState());
    expect(edited?.revision).toBe(selectRevision(h.store.getState()));
    expect(edited).toMatchObject({ data: { timeline: [{ children: [{ to: 950 }, {}] }] } });
  });

  it('switching the start re-resolves the timeline', async () => {
    const h = harness();
    h.run('flyout');
    await flush();

    h.store.dispatch(startModeSet('saved'));
    await flush();

    const resolved = selectCurrentResolution(h.store.getState());
    expect(resolved).toMatchObject({ data: { start: RUNTIME.from } });
    expect(resolved?.revision).toBe(selectRevision(h.store.getState()));
  });

  it('a revision still waiting for foci is superseded by a newer one', async () => {
    vi.useFakeTimers();
    let ready = false;
    const h = harness({
      ...FIXTURE,
      resolveFocusId: (id) => (ready ? FIXTURE.resolveFocusId(id) : null),
    });
    h.run('flyout');
    await vi.advanceTimersByTimeAsync(0);
    const draft = { timeline: [all([dollyTo(300, 4)]), focus(focusId('milkyWay'))] };
    const preview = selectPreview(h.store.getState())!;
    h.store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft, preview }));
    const waiting = selectRevision(h.store.getState());
    h.recorded.length = 0;

    h.store.dispatch(EDIT_DISTANCE);
    ready = true;
    await vi.advanceTimersByTimeAsync(500);

    const landed = h.recorded.filter(draftResolved.match).map((a) => a.payload.revision);
    expect(landed).toEqual([waiting + 1]);
    expect(selectCurrentResolution(h.store.getState())).not.toBeNull();
  });

  it("a picked object's position at the preview instant becomes the start's look-at, one Undo step", async () => {
    const h = harness();
    h.run('cosmicFlows');
    await flush();
    const before = selectDraft(h.store.getState())!;

    h.store.dispatch(
      objectPicked({
        ref: { kind: 'start' },
        param: 'target',
        label: 'Look-at',
        focusId: 'body-mars',
        stores: 'position',
      }),
    );
    await flush();

    const { simDays } = selectPreview(h.store.getState())!;
    const mars = FIXTURE.extractRow(FIXTURE.resolveFocusId('body-mars'), simDays) as PlacedRow;
    expect(selectDraft(h.store.getState())!.start).toMatchObject({ target: mars.positionMpc });
    h.store.dispatch(undone());
    expect(selectDraft(h.store.getState())).toEqual(before);
  });

  it("a picked object becomes a focus step's ref, one Undo step, and the step is named as its card names it", async () => {
    const h = harness();
    h.run('cosmicFlows');
    await flush();
    const preview = selectPreview(h.store.getState())!;
    const draft = { timeline: [{ kind: 'focus' as const, ref: null }] };
    h.store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft, preview }));
    await flush();

    h.store.dispatch(
      objectPicked({
        ref: { kind: 'effect', path: [0] },
        param: 'ref',
        label: 'Subject',
        focusId: 'body-mars',
        stores: 'ref',
      }),
    );
    await flush();

    const mars = FIXTURE.resolveFocusId('body-mars')!;
    expect(selectDraft(h.store.getState())!.timeline[0]).toEqual({ kind: 'focus', ref: mars });
    expect(selectRefNames(h.store.getState())).toEqual({ [refKey(mars)]: 'Mars' });
    h.store.dispatch(undone());
    expect(selectDraft(h.store.getState())).toEqual(draft);
  });

  it('ending the takeover keeps the draft in the slice', async () => {
    const h = harness();
    const task = h.run('flyout');
    await flush();
    h.store.dispatch(EDIT_DISTANCE);
    const edited = selectDraft(h.store.getState());

    task.cancel();
    await flush();

    expect(selectDraft(h.store.getState())).toBe(edited);
    expect(selectIsDirty(h.store.getState())).toBe(true);
  });
});
