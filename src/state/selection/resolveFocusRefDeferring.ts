/**
 * resolveFocusRefDeferring — the shared command->ref bridge both selection
 * command sagas (watchRequestFocusSaga, watchRequestSelectSaga) call. Resolves a
 * durable focus id to a SelectionRef via the composed resolver, DEFERRING
 * while it is unresolvable on BOTH catalog-commit pulses: catalogLoaded (the
 * galaxy cloud's commit signal) and engineSourceCountReported (every source's
 * count pulse, incl. the Gaia star bin, which never fires catalogLoaded). This
 * mirrors the both-pulses gap-fill in watchSelectionRowsSaga, so a star deep
 * link resolves the moment the star catalog lands, not never. The caller owns
 * which slot the resolved ref writes; this only turns an id into a ref.
 */
import { take, getContext } from 'typed-redux-saga';

import { catalogLoaded } from '../catalog/catalogLoaded';
import { engineSourceCountReported } from '../engine/engineSlice';
import type { SagaContext } from '../../store/types';

export function* resolveFocusRefDeferring(focusId: string) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let ref = selection.resolveFocusId(focusId);
  while (!ref) {
    yield* take([catalogLoaded, engineSourceCountReported]);
    ref = selection.resolveFocusId(focusId);
  }
  return ref;
}
