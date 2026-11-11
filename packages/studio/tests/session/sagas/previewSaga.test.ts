/**
 * The preview saga over a real store and the real `playClip` seam; the clip player is a fake that
 * records stops, and the frame loop is a hand-stepped `nextFrame` with a settable drawn t.
 */
import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../../src/store/rootReducer';
import { dollyTo, hold, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { createPlayClip } from '../../../../../src/services/engine/animation/playClip';
import { clipEnded } from '../../../../../src/state/camera/cameraSlice';
import { inputMoved } from '../../../../../src/state/input/inputSlice';
import { previewSaga } from '../../../src/session/sagas/previewSaga';
import {
  draftResolved,
  paramEdited,
  paused,
  played,
  playheadSet,
  studioOpened,
} from '../../../src/session/state/studioSlice';
import { selectDraft, selectRevision, selectTransport } from '../../../src/session/state/selectors';
import type { ClipClock } from '../../../../../src/@types/animation/ClipClock';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { PreviewPins } from '../../../src/@types/session/PreviewPins';

const PREVIEW: PreviewPins = {
  startPose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  simDays: 2451545,
  frame: 'equatorial',
  fovYRad: 0.8,
};
const DRAFT: ClipData = { start: PREVIEW.startPose, timeline: [seq([dollyTo(300, 4), hold(1)])] };
const EDIT = paramEdited({
  ref: { kind: 'effect', path: [0, 0] },
  param: 'to',
  value: 950,
  label: 'Distance',
  gesture: null,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness() {
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
  const stop = vi.fn(() => void store.dispatch(clipEnded()));
  const playClip = createPlayClip({
    store,
    clipPlayer: { stop, registerEndResolver: () => {} },
    getLivePose: () => PREVIEW.startPose,
  });
  let frameDone: () => void = () => {};
  let clipAt: ClipClock | null = null;
  mw.setContext({
    playClip,
    nextFrame: () => new Promise<void>((resolve) => (frameDone = resolve)),
    cameraRuntime: () => ({ clipAt }),
  });
  store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft: DRAFT, preview: PREVIEW }));
  const resolve = () =>
    store.dispatch(
      draftResolved({
        revision: selectRevision(store.getState()),
        data: selectDraft(store.getState())!,
      }),
    );
  const task = mw.run(previewSaga);
  // One drawn frame showing `sec`.
  const drawFrame = async (sec: number, held = false) => {
    clipAt = { sec, held };
    frameDone();
    await flush();
  };
  const types = () => recorded.map((a) => a.type);
  const clear = () => (recorded.length = 0);
  return { store, task, stop, resolve, drawFrame, types, clear };
}

describe('previewSaga', () => {
  it('the preview starts paused at the head once the draft resolves', () => {
    const h = harness();
    expect(h.store.getState().camera.clip).toBeNull();

    h.resolve();
    const { clip } = h.store.getState().camera;
    expect(clip?.data.timeline).toEqual(DRAFT.timeline);
    expect(clip?.atEnd).toBe('revert');
    expect(clip?.transport).toBe(selectTransport(h.store.getState()));
    expect(clip?.transport).toEqual({ kind: 'paused', atSec: 0, camera: 'clip' });
  });

  it('a seek sends one clipTransportSet and nothing else', () => {
    const h = harness();
    h.resolve();
    h.clear();

    h.store.dispatch(playheadSet(2));
    expect(h.types()).toEqual(['studio/playheadSet', 'camera/clipTransportSet']);
    expect(h.store.getState().camera.clip?.transport).toEqual({
      kind: 'paused',
      atSec: 2,
      camera: 'clip',
    });
  });

  it('an edit swaps the data into the live play', () => {
    const h = harness();
    h.resolve();
    const transport = h.store.getState().camera.clip!.transport;
    h.store.dispatch(EDIT);
    h.resolve();

    expect(h.types().filter((t) => t === 'camera/clipStarted')).toHaveLength(1);
    expect(h.types()).not.toContain('camera/clipEnded');
    const { clip } = h.store.getState().camera;
    expect(clip?.data).toBe(selectDraft(h.store.getState()));
    expect(clip?.transport).toBe(transport);
  });

  it('a failed resolution keeps the last good data', () => {
    const h = harness();
    h.resolve();
    const good = h.store.getState().camera.clip!.data;
    h.store.dispatch(EDIT);
    h.store.dispatch(
      draftResolved({ revision: selectRevision(h.store.getState()), message: 'no' }),
    );
    expect(h.store.getState().camera.clip!.data).toBe(good);
  });

  it('while playing, each frame follows the drawn t; pausing stops the follow', async () => {
    const h = harness();
    h.resolve();
    h.store.dispatch(played({ fromSec: 1, loop: null }));

    await h.drawFrame(1.5);
    await h.drawFrame(1.8);
    h.store.dispatch(paused());
    expect(selectTransport(h.store.getState())).toEqual({
      kind: 'paused',
      atSec: 1.8,
      camera: 'clip',
    });

    h.clear();
    await h.drawFrame(2.5);
    expect(h.types()).not.toContain('studio/playheadFollowed');
  });

  it('a held follow pauses the studio at the end', async () => {
    const h = harness();
    h.resolve();
    h.store.dispatch(played({ fromSec: 4, loop: null }));
    await h.drawFrame(5, true);
    expect(h.store.getState().camera.clip?.transport).toEqual({
      kind: 'paused',
      atSec: 5,
      camera: 'clip',
    });
  });

  it('a sky drag while following starts free look', () => {
    const h = harness();
    h.resolve();
    const motion = { intent: 'orbit', dx: 0.1, dy: 0, ratio: 1, at: null, held: true } as const;
    h.store.dispatch(inputMoved({ source: 'canvas', motion: [motion] }));
    expect(h.store.getState().camera.clip?.transport).toEqual({
      kind: 'paused',
      atSec: 0,
      camera: 'free',
    });
  });

  it('closing the studio stops the preview', () => {
    const h = harness();
    h.resolve();
    h.task.cancel();
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.store.getState().camera.clip).toBeNull();
  });
});
