/**
 * resolveDraftSaga — keeps the slice's resolution cache on the current draft revision: on open and
 * on every edit, start switch, undo and redo, wait for the draft's foci, resolve it against the
 * pinned preview and land it tagged with its revision (A6). The latest revision wins: a newer one
 * cancels a resolve still waiting. The calls are the ones `clipBodySaga` makes before playing a clip.
 */
import { call, cancel, fork, getContext, put, select, take } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import {
  draftResolved,
  paramEdited,
  redone,
  startModeSet,
  studioOpened,
  undone,
} from '../state/studioSlice';
import { selectStudioState } from '../state/selectors';
import { clipFociReady } from '../../../../../src/state/tour/clipFociReady';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import { resolveClipStart } from '../../../../../src/state/camera/cameraSlice';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import type { SagaContext } from '../../../../../src/store/types';
import type { StudioResolution } from '../../@types/session/StudioResolution';

const REVISION_ACTIONS = [studioOpened, paramEdited, startModeSet, undone, redone];

function* resolveRevisionSaga(selection: SagaContext['selection']): Generator {
  const { draft, preview, revision } = yield* select(selectStudioState);
  if (draft === null || preview === null) return;
  yield* call(waitUntilSaga, () => clipFociReady(draft, selection));
  let resolution: StudioResolution;
  try {
    const { startPose, simDays, frame, fovYRad } = preview;
    const data = resolveClipStart(
      resolveClipFoci(draft, selection, fovYRad, startPose, simDays, ORIENTATION_FRAMES[frame]),
      startPose,
    );
    resolution = { revision, data };
  } catch (error) {
    resolution = { revision, message: error instanceof Error ? error.message : String(error) };
  }
  yield* put(draftResolved(resolution));
}

export function* resolveDraftSaga(): Generator {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let pending: Task = yield* fork(resolveRevisionSaga, selection);
  while (true) {
    yield* take(REVISION_ACTIONS);
    yield* cancel(pending);
    pending = yield* fork(resolveRevisionSaga, selection);
  }
}
