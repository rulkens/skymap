/**
 * resolveFocusRefDeferringSaga — the shared command->ref bridge both selection
 * command sagas (watchRequestFocusSaga, watchRequestSelectSaga) call. Resolves a
 * durable focus id to a SelectionRef via the composed resolver, DEFERRING while
 * it is unresolvable on two pulses: engineSourceCountReported (every source's
 * catalog-landed pulse) and engineStatusChanged (`wireSlots` fires 'loading'
 * right after `createLayers` appends each Layer's selection rows — a
 * Layer-only id, e.g. `milkyWay`, needs that pulse to resolve during boot).
 * This mirrors the gap-fill in watchSelectionRowsSaga.
 */
import { take, getContext } from 'typed-redux-saga';

import { engineSourceCountReported, engineStatusChanged } from '../engine/engineSlice';
import type { SagaContext } from '../../store/types';

export function* resolveFocusRefDeferringSaga(focusId: string) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let ref = selection.resolveFocusId(focusId);
  while (!ref) {
    yield* take([engineSourceCountReported, engineStatusChanged]);
    ref = selection.resolveFocusId(focusId);
  }
  return ref;
}
