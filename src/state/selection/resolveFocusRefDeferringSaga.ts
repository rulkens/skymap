/**
 * resolveFocusRefDeferringSaga — the shared command->ref bridge both selection
 * command sagas (watchRequestFocusSaga, watchRequestSelectSaga) call. Resolves a
 * durable focus id to a selection ref via the composed resolver, DEFERRING while
 * it is `pending` on two pulses: engineSourceCountReported (every source's
 * catalog-landed pulse) and engineStatusChanged (`wireSlots` fires 'loading'
 * right after `createLayers` appends each Layer's selection rows — a
 * Layer-only id, e.g. `milkyWay`, needs that pulse to resolve during boot).
 * An `absent` id answers null at once: nothing that loads later can bring it.
 */
import { take, getContext } from 'typed-redux-saga';

import { engineSourceCountReported, engineStatusChanged } from '../engine/engineSlice';
import type { SagaContext } from '../../store/types';

export function* resolveFocusRefDeferringSaga(focusId: string) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let resolution = selection.resolveFocusId(focusId);
  while (resolution.kind === 'pending') {
    yield* take([engineSourceCountReported, engineStatusChanged]);
    resolution = selection.resolveFocusId(focusId);
  }
  return resolution.kind === 'hit' ? resolution.ref : null;
}
