/**
 * resolveFocusRefDeferring — the shared command->ref bridge both selection
 * command sagas (watchRequestFocusSaga, watchRequestSelectSaga) call. Resolves a
 * durable focus id to a SelectionRef via the composed resolver, DEFERRING while
 * it is unresolvable on the one catalog-landed pulse: engineSourceCountReported,
 * which every source reports on commit — the galaxy clouds and the Gaia star bin
 * alike. This mirrors the gap-fill in watchSelectionRowsSaga. The caller owns
 * which slot the resolved ref writes; this only turns an id into a ref.
 */
import { take, getContext } from 'typed-redux-saga';

import { engineSourceCountReported } from '../engine/engineSlice';
import type { SagaContext } from '../../store/types';

export function* resolveFocusRefDeferring(focusId: string) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let ref = selection.resolveFocusId(focusId);
  while (!ref) {
    yield* take(engineSourceCountReported);
    ref = selection.resolveFocusId(focusId);
  }
  return ref;
}
