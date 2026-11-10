/**
 * nameFocusRefsSaga — names each focus ref in `clip` (the draft's Focus steps, or the resolved clip's
 * focus-id steps) as its card does, once the ref's row loads. Components cannot reach the resolver, so the name lands in the slice for them to read.
 */
import { all, call, put, select } from 'typed-redux-saga';

import { refNamed } from '../state/studioSlice';
import { selectStudioState } from '../state/selectors';
import { focusRefs } from '../../draft/utils/focusRefs';
import { waitUntilSaga } from '../../../../../src/state/tour/waitUntilSaga';
import { selectionKindOf } from '../../../../../src/services/engine/selection/selectionKindOf';
import { refKey } from '../../../../../src/utils/selection/refKey';
import type { SagaContext } from '../../../../../src/store/types';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { SelectionRefBase } from '../../../../../src/@types/engine/selection/SelectionRefBase';

function* nameRefSaga(
  selection: SagaContext['selection'],
  ref: SelectionRefBase,
  simDays: number,
): Generator {
  yield* call(waitUntilSaga, () => selection.extractRow(ref, simDays) !== null);
  const kind = selectionKindOf(ref.type);
  const name = kind.displayName(kind.toFocusable(selection.extractRow(ref, simDays)));
  yield* put(refNamed({ key: refKey(ref), name }));
}

export function* nameFocusRefsSaga(selection: SagaContext['selection'], clip: ClipData): Generator {
  const { preview, refNames } = yield* select(selectStudioState);
  if (preview === null) return;
  const unnamed = focusRefs(clip).filter((ref) => refNames[refKey(ref)] === undefined);
  yield* all(unnamed.map((ref) => call(nameRefSaga, selection, ref, preview.simDays)));
}
