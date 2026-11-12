/**
 * watchSelectionRowsSaga — the SINGLE owner of the selectionRows cache: each
 * slot's row and durable id, kept in sync with its ref. A ref write (or
 * clearSelection, for select + focus) re-extracts its slot. Each commit pulse
 * first re-anchors every slot to its id, since a reload may reorder rows, then
 * fills slots whose ref landed before its data (a deep link).
 *
 * Every action that writes a selection ref MUST appear here, or its slot's row
 * goes stale — a clear that the UI never sees.
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
  factsReported,
  engineStatusChanged,
} from '../engine/engineSlice';
import { setSelectionRow } from './selectionRowsSlice';
import { SELECTION_WRITE_BY_SLOT } from '../selection/selectionWriteBySlot';
import { reanchorWrites } from '../../utils/selection/reanchorWrites';
import { shallowEqualRef } from '../../utils/object/shallowEqualRef';
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
  const row = selection.extractRow(ref, simDays);
  // An id is encoded only from a resolved row (ref-only encoders would publish
  // an unresolvable ref); an unresolved row keeps the previous id while the ref
  // is unchanged, so a released source can still be re-anchored by id.
  const prev = yield* select((state: RootState) => state[selectionRowsRoute]);
  const id = row
    ? (ref && selection.focusIdOf(ref)) || null
    : shallowEqualRef(prev.extractedFrom[slot], ref)
      ? prev.ids[slot]
      : null;
  yield* put(setSelectionRow({ slot, row, id, ref }));
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
  // The three pulses: every source's commit, a Layer's facts (structure's only
  // signal), and `wireSlots`' 'loading' right after `createLayers` appends the
  // Layer rows. Re-anchor writes re-enter `reextract`; the gap-fill's extra
  // firings are guarded no-ops (row === null && ref !== null).
  yield* takeEvery([engineSourceCountReported, factsReported, engineStatusChanged], function* () {
    const selection = yield* getContext<SagaContext['selection']>('selection');
    // A pending request owns its slot until it resolves or retires.
    const ids = { ...(yield* select((state: RootState) => state[selectionRowsRoute].ids)) };
    const refs = yield* select((state: RootState) => state[selectionRoute]);
    for (const slot of Object.keys(refs.pending) as (keyof typeof refs.pending)[]) {
      if (refs.pending[slot] !== null) ids[slot] = null;
    }
    for (const { slot, ref } of reanchorWrites(ids, refs, (id) => selection.resolveFocusId(id))) {
      yield* put(SELECTION_WRITE_BY_SLOT[slot](ref));
    }
    for (const slot of ['hover', 'select', 'focus'] as const) {
      const row = yield* select((state: RootState) => state[selectionRowsRoute][slot]);
      const ref = yield* select((state: RootState) => state[selectionRoute][slot]);
      if (row === null && ref !== null) yield* reextract(slot);
    }
  });
}
