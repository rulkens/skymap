/**
 * navigateSaga — the one path from a `LinkIntent` to the screen, for the boot
 * arrival (`'cut'`) and every later hash change (`'fly'`). `t` and
 * `orientation` land first, so a subject framed below is framed at the linked
 * instant and in the linked frame. Every camera commit waits for the camera
 * runtime: a commit before `wireInput`'s boot base would be overwritten by it.
 */
import { call, getContext, put, select, take } from 'typed-redux-saga';

import { requestFocus } from '../selection/requestFocus';
import { requestSelect } from '../selection/requestSelect';
import { updateSelectionFocus, updateSelectionSelect } from '../selection/selectionSlice';
import { selectFocusRow, selectPendingFocusId } from '../selection/selectors';
import { setSelectionRow } from '../selectionRows/selectionRowsSlice';
import { commitCameraPose } from '../camera/cameraSlice';
import { selectCameraBase } from '../camera/selectors';
import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { selectTimeState } from '../time/selectors';
import { setOrientation } from '../settings/core/orientationSlice';
import { selectOrientation } from '../settings/selectors';
import { framingPose } from '../../services/engine/camera/framingPose';
import { homePose } from '../../services/engine/camera/homePose';
import { isWorldArm } from '../../services/engine/camera/rungs/isWorldArm';
import { ROW_FOCUSABLE } from '../../services/engine/helpers/rowFocusable';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isCinemaMode } from '../../utils/url/isCinemaMode';
import type { LinkIntent } from '../../@types/url/LinkIntent';
import type { Transition } from '../../@types/navigation/Transition';
import type { NavigateOutcome } from '../../@types/navigation/NavigateOutcome';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { LiveCameraRuntime, SagaContext } from '../../store/types';

const OK: NavigateOutcome = { ok: true };

function* liveCameraRuntimeSaga() {
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  let runtime = cameraRuntime();
  while (runtime === null) {
    // Any action: `wireInput`'s boot commit is the first one after the
    // runtime exists, and nothing else announces it.
    yield* take('*');
    runtime = cameraRuntime();
  }
  return runtime;
}

function* commitSaga(pose: FramedCameraPose) {
  yield* call(liveCameraRuntimeSaga);
  yield* put(commitCameraPose(pose));
}

// Lands in the same tick as the focus row, so the frame that first follows a
// moving body already reads the commit as its framing and owes no approach.
function* frameFocusSaga(runtime: LiveCameraRuntime) {
  while (
    (yield* select(selectPendingFocusId)) !== null ||
    (yield* select(selectFocusRow)) === null
  ) {
    yield* take(setSelectionRow);
  }
  const row = (yield* select(selectFocusRow))!;
  if (!ROW_FOCUSABLE[row.type]) return;
  // The committed base, not the runtime's `from`: at boot the runtime still
  // reports its pre-commit placeholder for one frame.
  const base = yield* select(selectCameraBase);
  const from = isWorldArm(base) ? base.pose : runtime.from;
  yield* put(commitCameraPose(absoluteArm(framingPose(row, runtime.fovYRad, from))));
}

function* homeSaga() {
  const home = yield* getContext<SagaContext['home']>('home');
  const runtime = yield* call(liveCameraRuntimeSaga);
  const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
  const frameBasis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
  yield* put(commitCameraPose(homePose(home, runtime.fovYRad, simDays, frameBasis)));
  if (home.focus === null) return;
  // Cinema gates what the composition asked for, so it is an app-mode check
  // here rather than a composition knob.
  if (home.seedSelection && !isCinemaMode()) yield* put(updateSelectionSelect(home.focus.ref));
  yield* put(updateSelectionFocus(home.focus.ref, 'cut'));
}

export function* navigateSaga(intent: LinkIntent, transition: Transition) {
  if (intent.t !== undefined) {
    for (const action of manualPausedAtActions(new Date(intent.t))) yield* put(action);
  }
  if (intent.orientation !== undefined) yield* put(setOrientation(intent.orientation));

  const { view } = intent;
  switch (view.kind) {
    case 'home':
      // A hash change back to a bare URL keeps the camera where it is; the
      // absent rows' defaults are the read pass's to restore.
      if (transition === 'cut') yield* call(homeSaga);
      return OK;
    case 'pose':
      yield* call(commitSaga, view.pose);
      return OK;
    case 'focus': {
      // A linked pose IS the framing, so the focus lands on it with no move.
      if (view.pose !== undefined) yield* call(commitSaga, view.pose);
      const focusTransition = view.pose === undefined ? transition : 'cut';
      yield* put(requestSelect(view.id));
      yield* put(requestFocus({ id: view.id, transition: focusTransition }));
      if (view.pose === undefined && transition === 'cut') {
        yield* call(frameFocusSaga, yield* call(liveCameraRuntimeSaga));
      }
      return OK;
    }
    default:
      return { ok: false, reason: 'unknown-id' } satisfies NavigateOutcome;
  }
}
