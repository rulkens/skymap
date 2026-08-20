/**
 * watchSelectionRowsSaga — the reconciler: the SINGLE owner of the selectionRows
 * derived cache. It keeps every row in sync with its SelectionRef.
 *
 * On a ref change (updateSelection{Hover,Select,Focus}) it re-extracts that one
 * slot. On clearSelection it re-extracts select + focus (the slots that action
 * nulls) so the derived rows clear in lockstep with the refs — Esc / InfoCard ×
 * depend on this. The gap-fill re-extracts any slot whose row is still null but
 * whose ref is set (a deep link resolved before its data landed), and it fires
 * on BOTH catalog-commit pulses: catalogLoaded is the galaxy cloud's commit
 * signal, while engineSourceCountReported is every source's count pulse — the
 * one the Gaia star bin emits on commit (it never dispatches catalogLoaded). A
 * star deep link therefore resolves the moment the star catalog lands, not never.
 *
 * Keyed on the COMPLETE resolvability set (every selection-slice action ∪ both
 * commit pulses), so the cache can't hand-sync-drift the way two authoritative
 * homes do — this is what justifies materializing a derived value in the store
 * (see the spec's exception note).
 *
 * Every action that writes a selection ref MUST appear here, or its slot's row
 * goes stale — a clear that the UI never sees.
 *
 * It reaches the live engine cloud/structures via getContext('resolveDeps'),
 * the same seam watchTierSaga uses for runTierTransition. The reducers stay free of
 * engine references; only this saga crosses the boundary.
 */
import { takeEvery, select, put, getContext } from 'typed-redux-saga';

import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../selection/selectionSlice';
import { catalogLoaded } from '../catalog/catalogLoaded';
import { engineSourceCountReported } from '../engine/engineSlice';
import { setSelectionRow } from './selectionRowsSlice';
import { extractSelectionRow } from '../../services/engine/helpers/extractSelectionRow';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import type { RootState, SagaContext } from '../../store/types';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

function* reextract(slot: SelectionSlot) {
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
  // Off-frame resolve — derive the sim instant from the time-intent slice the
  // same way `watchGoHomeSaga` does, so a body row's position matches where the
  // render path draws it rather than a fixed epoch.
  const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
  yield* put(setSelectionRow({ slot, row: extractSelectionRow(ref, resolveDeps(), simDays) }));
}

export function* watchSelectionRowsSaga() {
  yield* takeEvery(updateSelectionHover, function* () {
    yield* reextract('hover');
  });
  yield* takeEvery(updateSelectionSelect, function* () {
    yield* reextract('select');
  });
  yield* takeEvery(updateSelectionFocus, function* () {
    yield* reextract('focus');
  });
  // clearSelection nulls the select + focus refs in one action; re-extract both
  // so their derived rows clear too (the reducer leaves hover alone).
  yield* takeEvery(clearSelection, function* () {
    yield* reextract('select');
    yield* reextract('focus');
  });
  // A late catalog makes a previously-unresolvable ref resolvable — fill the
  // gaps. Both commit pulses wake it: catalogLoaded (galaxy cloud) and
  // engineSourceCountReported (every source's count pulse, incl. the star bin,
  // which never fires catalogLoaded). Extra firings for already-filled slots are
  // guarded no-ops (row === null && ref !== null), so the star count report is
  // harmless for galaxy slots and vice versa.
  yield* takeEvery([catalogLoaded, engineSourceCountReported], function* () {
    for (const slot of ['hover', 'select', 'focus'] as const) {
      const row = yield* select((state: RootState) => state[selectionRowsRoute][slot]);
      const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
      if (row === null && ref !== null) yield* reextract(slot);
    }
  });
}
