/**
 * pickObjectSaga — answers a picked object with its position at the preview's frozen instant, or
 * its selection ref, as one `paramEdited` (one Undo step). It waits for the object's catalog row;
 * a newer pick cancels it.
 */
import { call, getContext, put, select, takeLatest } from 'typed-redux-saga';

import { paramEdited } from '../state/studioSlice';
import { objectPicked } from '../state/objectPicked';
import { selectPreview } from '../state/selectors';
import { focusPosition } from '../utils/focusPosition';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import type { SagaContext } from '../../../../../src/store/types';

function* resolvePickSaga(
  selection: SagaContext['selection'],
  { payload }: ReturnType<typeof objectPicked>,
): Generator {
  const preview = yield* select(selectPreview);
  if (preview === null) return;
  const { ref, param, label, focusId, stores } = payload;
  const value = () =>
    stores === 'position'
      ? focusPosition(selection, focusId, preview.simDays)
      : selection.resolveFocusId(focusId);
  yield* call(waitUntilSaga, () => value() !== null);
  yield* put(paramEdited({ ref, param, value: value()!, label, gesture: null }));
}

export function* pickObjectSaga(): Generator {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  yield* takeLatest(objectPicked, resolvePickSaga, selection);
}
