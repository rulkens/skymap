/**
 * clipBodySaga — a registry clip's takeover body: build the clip at the frozen
 * clip-start instant, wait for its foci, play it through the `playClip` seam,
 * and end on `exitTakeover` as tour and exhibit bodies do. Cancellation reaches
 * the seam's `[CANCEL]` hook, which stops the player.
 * A clip leaves the scene alone; what it holds is the sim clock, frozen so
 * nothing drifts under a scripted move (`withFrozenClockSaga`).
 */
import { call, race, take, getContext, select } from 'typed-redux-saga';

import { exitTakeover } from '../takeover/takeoverActions';
import { clipFactories } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectOrientation } from '../settings/selectors';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntilSaga } from '../tour/waitUntilSaga';
import { withFrozenClockSaga } from '../time/withFrozenClockSaga';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SagaContext } from '../../store/types';

export function* clipBodySaga(id: ClipId): Generator {
  const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
  const selection = yield* getContext<SagaContext['selection']>('selection');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

  // An instant-dependent clip (`earthFlyout`) opens on the bodies the frozen
  // frame draws; static clips ignore the argument.
  yield* withFrozenClockSaga(function* (frozenSimDays) {
    const clip = clipFactories[id](frozenSimDays);
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
        yield* call(playClipSeam, resolved, orientation, 'revert' as const);
      }),
      exit: take(exitTakeover),
    });
  });
}
