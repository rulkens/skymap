/**
 * viewUsedSaga — answers Use current view: reads the drawn camera and writes it into the row as one
 * Undo step, the Start row re-pinning the preview instead. The drawn pose is in the live up-basis,
 * which a `frameTo` step may have rolled away from the clip's pinned frame, so it is re-expressed
 * from `upBasisQuat` (never from intent, which the clip overlay does not reach); the inverse of the
 * clip row's exit re-encode in `cameraDrivers.ts`.
 */
import { getContext, put, select, takeEvery } from 'typed-redux-saga';

import { rowReplaced, startPinned, viewUsed } from '../state/studioSlice';
import { selectStudioState } from '../state/selectors';
import { VIEW_USED_LABEL } from '../data/viewUsedLabel';
import { effectAt } from '../../draft/utils/effectAt';
import { inspectorSpec } from '../../inspector/utils/inspectorSpec';
import { reencodePose } from '../../../../../src/services/engine/camera/drivers/utils/reencodePose';
import { quaternionToMatrix } from '../../../../../src/utils/math/quaternionToMatrix';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import type { SagaContext } from '../../../../../src/store/types';

function* answerViewUsedSaga(
  cameraRuntime: SagaContext['cameraRuntime'],
  { payload: ref }: ReturnType<typeof viewUsed>,
): Generator {
  const runtime = cameraRuntime();
  const { draft, preview } = yield* select(selectStudioState);
  if (runtime === null || draft === null || preview === null) return;
  // A copy: the runtime may hand out the engine's own pose, and the store freezes what it keeps.
  const live = structuredClone(runtime.from);
  const pose = reencodePose(
    live,
    quaternionToMatrix(runtime.upBasisQuat),
    ORIENTATION_FRAMES[preview.frame],
  );
  const view = { pose, fovYRad: runtime.fovYRad };
  if (ref.kind === 'start') {
    yield* put(startPinned(view));
    return;
  }
  if (ref.kind !== 'effect') return;
  const effect = effectAt(draft, ref.path);
  const fromView = effect === null ? null : inspectorSpec(effect.kind).fromView;
  if (effect === null || fromView === null) return;
  yield* put(rowReplaced({ ref, effect: fromView(effect, view), label: VIEW_USED_LABEL }));
}

export function* viewUsedSaga(): Generator {
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  yield* takeEvery(viewUsed, answerViewUsedSaga, cameraRuntime);
}
