/**
 * watchSelectionRowsSaga — the reconciler: the SINGLE owner of the selectionRows
 * derived cache. It keeps every row in sync with its SelectionRef.
 *
 * On a ref change (updateSelection{Hover,Select,Focus}) it re-extracts that one
 * slot. On clearSelection it re-extracts select + focus (the slots that action
 * nulls) so the derived rows clear in lockstep with the refs — Esc / InfoCard ×
 * depend on this. The gap-fill re-extracts any slot whose row is still null but
 * whose ref is set (a deep link resolved before its data landed), and it fires
 * on three pulses: engineSourceCountReported (every source's commit — the
 * galaxy clouds and the Gaia star bin alike), engineStructureCountsChanged
 * (the structure store's only signal), and engineStatusChanged (`wireSlots`
 * fires 'loading' right after `createLayers` appends each Layer's selection
 * rows — a Layer-only id needs this one to resolve during boot).
 *
 * Keyed on the COMPLETE resolvability set (every selection-slice action ∪ the
 * catalog-, structure- and Layer-rows-landed pulses), so the cache can't
 * hand-sync-drift the way two authoritative homes do — this is what
 * justifies materializing a derived value in the store (see the spec's
 * exception note).
 *
 * Every action that writes a selection ref MUST appear here, or its slot's row
 * goes stale — a clear that the UI never sees.
 *
 * It reaches the composed resolver via getContext('selection'), the same seam
 * watchTierSaga reads for its re-anchor capture. The reducers stay free of
 * engine references; only this saga crosses the boundary.
 */
import { takeEvery, select, put, getContext } from 'typed-redux-saga';

import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../selection/selectionSlice';
import {
  engineSourceCountReported,
  engineStructureCountsChanged,
  engineStatusChanged,
} from '../engine/engineSlice';
import { setSelectionRow } from './selectionRowsSlice';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import type { RootState, SagaContext } from '../../store/types';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

function* reextract(slot: SelectionSlot) {
  const selection = yield* getContext<SagaContext['selection']>('selection');
  const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
  // Off-frame resolve — derive the sim instant from the time-intent slice the
  // same way `watchGoHomeSaga` does, so a body row's position matches where the
  // render path draws it rather than a fixed epoch.
  const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
  yield* put(setSelectionRow({ slot, row: selection.extractRow(ref, simDays) }));
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
  // A late catalog, or the Layer rows landing (engineStatusChanged: 'loading',
  // fired by `wireSlots` right after `createLayers`), makes a previously-
  // unresolvable ref resolvable — fill the gaps. Extra firings for
  // already-filled slots are guarded no-ops (row === null && ref !== null).
  yield* takeEvery(
    [engineSourceCountReported, engineStructureCountsChanged, engineStatusChanged],
    function* () {
      for (const slot of ['hover', 'select', 'focus'] as const) {
        const row = yield* select((state: RootState) => state[selectionRowsRoute][slot]);
        const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
        if (row === null && ref !== null) yield* reextract(slot);
      }
    },
  );
}
