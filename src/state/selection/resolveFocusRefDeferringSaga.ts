/**
 * resolveFocusRefDeferringSaga — the id->ref bridge both request sagas call. It
 * waits while the id is `pending`, retrying on each catalog-landed count pulse,
 * and answers null once it is `absent` (spec 2026-11-11-tier-swap-galaxy-reanchor §4.1).
 */
import { take, getContext } from 'typed-redux-saga';

import { engineSourceCountReported } from '../engine/engineSlice';
import { refOfResolution } from '../../utils/selection/refOfResolution';
import type { SagaContext } from '../../store/types';

export function* resolveFocusRefDeferringSaga(focusId: string) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  let resolution = selection.resolveFocusId(focusId);
  while (resolution.kind === 'pending') {
    yield* take(engineSourceCountReported);
    resolution = selection.resolveFocusId(focusId);
  }
  return refOfResolution(resolution);
}
