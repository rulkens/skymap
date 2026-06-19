/**
 * watchSelectionRows — the reconciler: the SINGLE owner of the selectionRows
 * derived cache. It keeps every row in sync with its SelectionRef.
 *
 * On a ref change (updateSelection{Hover,Select,Focus}) it re-extracts that one
 * slot. On catalogLoaded — a late cloud arriving — it re-extracts any slot
 * whose row is still null but whose ref is set (a deep link, or a galaxy in a
 * tier whose cloud just finished loading). Keyed on the COMPLETE trigger set
 * (ref writes ∪ catalogLoaded), so the cache can't hand-sync-drift the way two
 * authoritative homes do — this is what justifies materializing a derived value
 * in the store (see the spec's exception note).
 *
 * It reaches the live engine cloud/structures via getContext('resolveDeps'),
 * the same seam tierSaga uses for runTierTransition. The reducers stay free of
 * engine references; only this saga crosses the boundary.
 */
import { takeEvery, select, put, getContext } from 'typed-redux-saga';

import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../selection/selectionSlice';
import { catalogLoaded } from '../dataStatus/dataStatusSlice';
import { setSelectionRow } from './selectionRowsSlice';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import type { RootState, SagaContext } from '../../store/types';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

function* reextract(slot: SelectionSlot) {
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
  yield* put(setSelectionRow({ slot, row: extractSelectionRow(ref, resolveDeps()) }));
}

export function* watchSelectionRows() {
  yield* takeEvery(updateSelectionHover, function* () {
    yield* reextract('hover');
  });
  yield* takeEvery(updateSelectionSelect, function* () {
    yield* reextract('select');
  });
  yield* takeEvery(updateSelectionFocus, function* () {
    yield* reextract('focus');
  });
  // A late cloud makes a previously-unresolvable ref resolvable — fill the gaps.
  yield* takeEvery(catalogLoaded, function* () {
    for (const slot of ['hover', 'select', 'focus'] as const) {
      const row = yield* select((state: RootState) => state[selectionRowsRoute][slot]);
      const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
      if (row === null && ref !== null) yield* reextract(slot);
    }
  });
}
