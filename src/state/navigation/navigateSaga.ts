/**
 * navigateSaga — the one path from a `LinkIntent` to the screen, for the boot
 * arrival (`'cut'`) and every later hash change (`'fly'`). `t` and
 * `orientation` land first, so a subject framed below is framed at the linked
 * instant and in the linked frame; the arrival lands them itself, before the
 * runtime is seeded, and passes only the view. Every camera commit waits for
 * the camera runtime (`liveCameraRuntimeSaga`).
 */
import { all, call, cancelled, delay, getContext, put, race, select, take } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';
import type { SagaGenerator } from 'typed-redux-saga';

import { liveCameraRuntimeSaga } from './liveCameraRuntimeSaga';
import { applyLinkClockAndFrameSaga } from './applyLinkClockAndFrameSaga';
import { requestFocus } from '../selection/requestFocus';
import { requestSelect } from '../selection/requestSelect';
import {
  clearSelection,
  updateSelectionFocus,
  updateSelectionSelect,
} from '../selection/selectionSlice';
import { selectFocusRow, selectPendingFocusId } from '../selection/selectors';
import { setSelectionRow } from '../selectionRows/selectionRowsSlice';
import { engineLoadProgressChanged } from '../engine/engineSlice';
import { selectEngineStatus, selectLoadProgress } from '../engine/selectors';
import { clipStarted, commitCameraPose } from '../camera/cameraSlice';
import { startClip, stopClip } from '../camera/clipActions';
import { exitTakeover } from '../takeover/takeoverActions';
import { openExhibit } from '../exhibits/exhibitActions';
import { startTour } from '../tour/tourActions';
import { selectCameraBase } from '../camera/selectors';
import { selectTimeState } from '../time/selectors';
import { selectOrientation } from '../settings/selectors';
import { framingPose } from '../../services/engine/camera/framingPose';
import { homePose } from '../../services/engine/camera/homePose';
import { isWorldArm } from '../../services/engine/camera/rungs/isWorldArm';
import { ROW_FOCUSABLE } from '../../services/engine/helpers/rowFocusable';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import { clipFactories } from '../../data/animation/clips/clipRegistry';
import { isKeyOf } from '../../utils/object/isKeyOf';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isCinemaMode } from '../../utils/url/isCinemaMode';
import type { LinkIntent } from '../../@types/url/LinkIntent';
import type { Transition } from '../../@types/navigation/Transition';
import type { NavigateOutcome } from '../../@types/navigation/NavigateOutcome';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { LiveCameraRuntime, SagaContext } from '../../store/types';

const OK: NavigateOutcome = { ok: true };
const UNKNOWN_ID: NavigateOutcome = { ok: false, reason: 'unknown-id' };

function* commitSaga(pose: FramedCameraPose) {
  yield* call(liveCameraRuntimeSaga);
  yield* put(commitCameraPose(pose));
}

const isLoadIdle = (action: Action): boolean =>
  engineLoadProgressChanged.match(action) && action.payload === null;

// Commits in the same tick the focus row lands, so the frame that first
// follows a moving body already reads the commit as its framing and owes no
// approach. An id still unresolved once every load has gone quiet names
// nothing the loaded catalogs hold.
function* frameFocusSaga(runtime: LiveCameraRuntime): SagaGenerator<NavigateOutcome> {
  while (
    (yield* select(selectPendingFocusId)) !== null ||
    (yield* select(selectFocusRow)) === null
  ) {
    const { idle } = yield* race({ row: take(setSelectionRow), idle: take(isLoadIdle) });
    if (idle === undefined) continue;
    // A catalog's count report, which resolves its ids, trails the idle
    // report it lands with by an async hop; a load that started in that hop
    // may still bring the id.
    yield* delay(0);
    const ready = (yield* select(selectEngineStatus)).kind === 'ready';
    const stillIdle = (yield* select(selectLoadProgress)) === null;
    if (ready && stillIdle && (yield* select(selectPendingFocusId)) !== null) return UNKNOWN_ID;
  }
  const row = (yield* select(selectFocusRow))!;
  if (!ROW_FOCUSABLE[row.type]) return OK;
  // The committed base, not the runtime's `from`: at boot the runtime still
  // reports its pre-commit placeholder for one frame.
  const base = yield* select(selectCameraBase);
  const from = isWorldArm(base) ? base.pose : runtime.from;
  yield* put(commitCameraPose(absoluteArm(framingPose(row, runtime.fovYRad, from))));
  return OK;
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

// A tour or clip opens on its own first frame, so a cut arrival is done only
// once the first clip has started: an opening snap or a fixed `start` lands
// before the reveal. An arrival that gives up first stops what it started,
// or the play could still begin over home after the veil has lifted.
function* firstClipSaga(
  start: Action,
  stop: Action,
  transition: Transition,
): SagaGenerator<NavigateOutcome> {
  if (transition === 'fly') {
    yield* put(start);
    return OK;
  }
  try {
    yield* all([take(clipStarted), put(start)]);
  } finally {
    if (yield* cancelled()) yield* put(stop);
  }
  return OK;
}

export function* navigateSaga(
  intent: LinkIntent,
  transition: Transition,
): SagaGenerator<NavigateOutcome> {
  yield* call(applyLinkClockAndFrameSaga, intent);

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
      if (view.pose !== undefined || transition === 'fly') return OK;
      return yield* call(frameFocusSaga, yield* call(liveCameraRuntimeSaga));
    }
    case 'exhibit':
      if (!isKeyOf(exhibitRegistry, view.id)) return UNKNOWN_ID;
      // The fitted pose reads the live lens, so the cut waits for it.
      yield* call(liveCameraRuntimeSaga);
      yield* put(openExhibit({ id: view.id, entry: transition }));
      return OK;
    case 'tour':
      if (!isKeyOf(tourRegistry, view.id)) return UNKNOWN_ID;
      // A live start begins on the home framing, as from the splash.
      if (transition === 'cut') yield* call(homeSaga);
      return yield* call(firstClipSaga, startTour(view.id), exitTakeover(), transition);
    case 'clip':
      if (!isKeyOf(clipFactories, view.id)) return UNKNOWN_ID;
      if (transition === 'cut') {
        yield* call(homeSaga);
        // A tour clears the seeded focus itself; a clip does not, so Earth's
        // card would sit over it and follow would ease back when it ends.
        yield* put(clearSelection());
      }
      return yield* call(firstClipSaga, startClip(view.id), stopClip(), transition);
  }
}
