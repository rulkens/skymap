/**
 * Use current view over the whole session saga and a real store: the drawn camera is a settable
 * runtime, so a capture can be taken under any live up-basis.
 */
import { describe, it, expect } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../../src/store/rootReducer';
import { moveTargetId } from '../../../../../src/services/engine/animation/effectHelpers';
import { ORIENTATION_FRAME_QUATERNIONS } from '../../../../../src/data/orientation/orientationFrames';
import { focusId } from '../../../../../src/utils/animation/focusId';
import { studioSessionSaga } from '../../../src/session/sagas/studioSessionSaga';
import { studioOpened, undone, viewUsed } from '../../../src/session/state/studioSlice';
import {
  selectCurrentResolution,
  selectDraft,
  selectPreview,
  selectRevision,
  selectUndoLabel,
} from '../../../src/session/state/selectors';
import { selectionResolverOver } from '../../../../../tests/support/selectionResolverOver';
import { installAppSelectionKinds } from '../../../../../tests/support/installAppSelectionKinds';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { LiveCameraRuntime } from '../../../../../src/store/types';
import type { PreviewPins } from '../../../src/@types/session/PreviewPins';

installAppSelectionKinds();

const flush = () => new Promise((r) => setTimeout(r, 0));
const DEG = Math.PI / 180;
const PREVIEW: PreviewPins = {
  startPose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  simDays: 2451545,
  frame: 'equatorial',
  fovYRad: 0.8,
};

async function session(draft: ClipData, runtime: LiveCameraRuntime) {
  const mw = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
  mw.setContext({
    selection: selectionResolverOver({ byId: () => null, byCategory: () => [] }),
    cameraRuntime: () => runtime,
    playClip: () => new Promise<void>(() => {}),
    nextFrame: () => new Promise<void>(() => {}),
  });
  mw.run(studioSessionSaga, 'flyout');
  await flush();
  store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft, preview: PREVIEW }));
  await flush();
  return store;
}

const equatorialRuntime = (from: LiveCameraRuntime['from']): LiveCameraRuntime => ({
  from,
  fovYRad: 0.5,
  aspect: 16 / 9,
  upBasisQuat: ORIENTATION_FRAME_QUATERNIONS.equatorial,
  clipAt: null,
});

describe('viewUsedSaga', () => {
  it("a view captured after a frame roll is re-expressed in the clip's pinned frame", async () => {
    // Pitch +90° under the supergalactic basis puts the eye on the SG north pole from the target,
    // RA 283.754°, Dec +15.709°. In the equatorial frame (pole +z in the middle column, col 2 = −y)
    // the local direction is (x, z, −y) of that pole: pitch = Dec, yaw = atan2(cos α, −sin α) = α − 270°.
    const store = await session(
      { start: PREVIEW.startPose, timeline: [] },
      {
        from: { target: [1, 2, 3], yaw: 0.7, pitch: Math.PI / 2, distance: 5 },
        fovYRad: 0.5,
        aspect: 16 / 9,
        upBasisQuat: ORIENTATION_FRAME_QUATERNIONS.supergalactic,
        clipAt: null,
      },
    );

    store.dispatch(viewUsed({ kind: 'start' }));

    const { startPose } = selectPreview(store.getState())!;
    expect(startPose.pitch / DEG).toBeCloseTo(15.709, 2);
    expect(startPose.yaw / DEG).toBeCloseTo(13.754, 2);
    expect(startPose).toMatchObject({ target: [1, 2, 3], distance: 5 });
  });

  it('Use current view on a bound Look-at replaces it by a Look-at point at the drawn target; Undo restores it', async () => {
    const bound = moveTargetId(focusId('body-mars'), 3, 'easeOutCubic');
    const draft: ClipData = { start: PREVIEW.startPose, timeline: [bound] };
    const store = await session(
      draft,
      equatorialRuntime({ target: [4, 5, 6], yaw: 0, pitch: 0, distance: 2 }),
    );

    store.dispatch(viewUsed({ kind: 'effect', path: [0] }));

    expect(selectDraft(store.getState())!.timeline[0]).toMatchObject({
      kind: 'setVec',
      to: [4, 5, 6],
      over: 3,
      ease: 'easeOutCubic',
    });
    expect(selectUndoLabel(store.getState())).toBe('Use current view');
    store.dispatch(undone());
    expect(selectDraft(store.getState())!.timeline[0]).toBe(bound);
  });

  it('Use current view on Start re-pins the preview and bumps the revision; a Live start stays live', async () => {
    const from = {
      target: [7, 8, 9] as [number, number, number],
      yaw: 0.2,
      pitch: 0.1,
      distance: 3,
    };
    const store = await session({ start: 'live', timeline: [] }, equatorialRuntime(from));
    const revision = selectRevision(store.getState());

    store.dispatch(viewUsed({ kind: 'start' }));
    await flush();

    const state = store.getState();
    const { startPose, fovYRad } = selectPreview(state)!;
    expect(startPose).toMatchObject({ target: from.target, distance: from.distance });
    expect(startPose.yaw).toBeCloseTo(from.yaw, 9);
    expect(startPose.pitch).toBeCloseTo(from.pitch, 9);
    expect(fovYRad).toBe(0.5);
    expect(selectRevision(state)).toBe(revision + 1);
    expect(selectDraft(state)!.start).toBe('live');
    expect(selectUndoLabel(state)).toBeNull();
    // The re-pin re-resolves: the live start now resolves at the captured pose.
    expect(selectCurrentResolution(state)).toMatchObject({ data: { start: startPose } });
  });
});
