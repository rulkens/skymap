/**
 * studioSessionSaga — the studio takeover's body inside the chunk: inject the slice, freeze the
 * clock, pin the preview (Q7: start pose, lens, sim instant and orientation frame as the clip
 * opens), open the clip's draft, and keep it resolved until the takeover ends. Nothing is cleared
 * on exit: the draft stays in the slice for a reopen (A4, Q28).
 */
import { call, getContext, put, select } from 'typed-redux-saga';

import { resolveDraftSaga } from './resolveDraftSaga';
import { injectStudioSlice } from '../state/injectStudioSlice';
import { studioOpened } from '../state/studioSlice';
import { withFrozenClockSaga } from '../../../../../src/state/time/withFrozenClockSaga';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import { selectOrientation } from '../../../../../src/state/settings/selectors';
import { clipFactories } from '../../../../../src/data/animation/clips/clipRegistry';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { SagaContext } from '../../../../../src/store/types';

export function* studioSessionSaga(id: ClipId): Generator {
  injectStudioSlice();
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  yield* withFrozenClockSaga(function* (simDays) {
    yield* call(waitUntilSaga, () => cameraRuntime() !== null);
    const { from, fovYRad } = cameraRuntime()!;
    const frame = yield* select(selectOrientation);
    // A copy: the runtime may hand out the engine's own displayed pose, and the store freezes state.
    const preview = { startPose: structuredClone(from), simDays, frame, fovYRad };
    yield* put(studioOpened({ clipId: id, draft: clipFactories[id](simDays).data, preview }));
    yield* call(resolveDraftSaga);
  });
}
