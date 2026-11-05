/**
 * clipBodySaga — a registry clip's takeover body: build the clip at the frozen
 * clip-start instant, wait for its foci, play it through the `playClip` seam,
 * and end on `exitTakeover` as tour and exhibit bodies do. Cancellation reaches
 * the seam's `[CANCEL]` hook, which stops the player.
 * A clip leaves the scene alone; what it holds is the sim clock, frozen so
 * nothing drifts under a scripted move and restored in its own `finally`.
 */
import { call, race, take, getContext, put, select } from 'typed-redux-saga';

import { exitTakeover } from '../takeover/takeoverActions';
import { clipFactories } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectOrientation } from '../settings/selectors';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntilSaga } from '../tour/waitUntilSaga';
import { pause, resume } from '../time/timeSlice';
import { goLiveNowAction } from '../time/goLiveNowAction';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { ClipId } from '../../@types/animation/ClipId';
import type { RootState, SagaContext } from '../../store/types';

export function* clipBodySaga(id: ClipId): Generator {
  const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
  const selection = yield* getContext<SagaContext['selection']>('selection');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

  // The frozen clip-start instant, derived at the SAME `nowMs` the `pause`
  // re-anchors from, so it equals the sim time the clock holds for the whole
  // clip. An instant-dependent clip (`earthFlyout`) opens on the bodies the
  // frozen frame draws; static clips ignore the argument.
  const nowMs = performance.now();
  const priorTime = yield* select((state: RootState) => state.time);
  const { mode: priorMode, paused: priorPaused } = priorTime;
  const frozenSimDays = deriveSimDays(priorTime, nowMs);
  const clip = clipFactories[id](frozenSimDays);
  yield* put(pause({ nowMs }));
  try {
    yield* race({
      run: call(function* () {
        // `compileClip` throws on an unresolved id-bearing cue, so wait for
        // every cue to resolve AND for the runtime that carries the FOV.
        yield* call(
          waitUntilSaga,
          () => clipFociReady(clip.data, selection) && cameraRuntime() !== null,
        );
        const rt = cameraRuntime()!;
        // The steady orientation basis, so a lookAtId bearing encodes through
        // the frame the render path decodes with; it also pins the clip's frame.
        const orientation = yield* select(selectOrientation);
        const frameBasis = ORIENTATION_FRAMES[orientation];
        const resolved = resolveClipFoci(
          clip.data,
          selection,
          rt.fovYRad,
          rt.from,
          frozenSimDays,
          frameBasis,
        );
        yield* call(playClipSeam, resolved, orientation);
      }),
      exit: take(exitTakeover),
    });
  } finally {
    // Give back what the clip interrupted: live re-snaps to the wall clock,
    // a playing manual clock resumes, and a paused one stays paused — the
    // clip's own `pause` only re-anchored it, which moves no sim time.
    if (priorMode === 'live') {
      yield* put(goLiveNowAction());
    } else if (!priorPaused) {
      yield* put(resume({ nowMs: performance.now() }));
    }
  }
}
