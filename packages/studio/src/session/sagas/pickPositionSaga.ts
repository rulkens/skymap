/**
 * pickPositionSaga — answers a picked object with its position at the preview's frozen instant, as
 * one `paramEdited` (one Undo step). It waits for the object's catalog row; a newer pick cancels it.
 */
import { call, getContext, put, select, takeLatest } from 'typed-redux-saga';

import { paramEdited } from '../state/studioSlice';
import { positionPicked } from '../state/positionPicked';
import { selectPreview } from '../state/selectors';
import { focusPosition } from '../utils/focusPosition';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import type { SagaContext } from '../../../../../src/store/types';

function* resolvePickSaga(
  selection: SagaContext['selection'],
  { payload }: ReturnType<typeof positionPicked>,
): Generator {
  const preview = yield* select(selectPreview);
  if (preview === null) return;
  const at = () => focusPosition(selection, payload.focusId, preview.simDays);
  yield* call(waitUntilSaga, () => at() !== null);
  const { ref, param, label } = payload;
  yield* put(paramEdited({ ref, param, value: at()!, label, gesture: null }));
}

export function* pickPositionSaga(): Generator {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  yield* takeLatest(positionPicked, resolvePickSaga, selection);
}
