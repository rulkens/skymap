/**
 * pickObjectSaga — answers a picked object with its position at the preview's frozen instant, or
 * its selection ref, as one `paramEdited` (one Undo step). It waits for the object's catalog row
 * up to `PICK_TIMEOUT_MS`, then answers `pickFailed` and edits nothing; a newer pick cancels it.
 */
import { call, delay, getContext, put, race, select, takeLatest } from 'typed-redux-saga';

import { objectPicked, paramEdited, pickFailed } from '../state/studioSlice';
import { PICK_TIMEOUT_MS } from '../data/studioLimits';
import { selectPreview } from '../state/selectors';
import { focusPosition } from '../utils/focusPosition';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import type { SagaContext } from '../../../../../src/store/types';

function* resolvePickSaga(
  selection: SagaContext['selection'],
  { payload }: ReturnType<typeof objectPicked>,
): Generator {
  const preview = yield* select(selectPreview);
  const { ref, param, label, focusId, stores } = payload;
  const value = () =>
    preview === null
      ? null
      : stores === 'position'
        ? focusPosition(selection, focusId, preview.simDays)
        : selection.resolveFocusId(focusId);
  const { late } = yield* race({
    found: call(waitUntilSaga, () => value() !== null),
    late: delay(PICK_TIMEOUT_MS),
  });
  if (late) yield* put(pickFailed(payload));
  else yield* put(paramEdited({ ref, param, value: value()!, label, gesture: null }));
}

export function* pickObjectSaga(): Generator {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  yield* takeLatest(objectPicked, resolvePickSaga, selection);
}
