import { describe, it, expect } from 'vitest';

import reducer, {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { requestSelect } from '../../../src/state/selection/requestSelect';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { Source } from '../../../src/data/sources';
import type { SelectionState } from '../../../src/@types/store/SelectionState';

const ref = { type: 'galaxyCatalog', source: Source.SDSS, index: 7 } as const;

describe('selectionSlice', () => {
  it('updateSelectionSelect writes the ref', () => {
    const next = reducer(undefined, updateSelectionSelect(ref));
    expect(next.select).toEqual(ref);
  });

  it('dedups a structurally-equal write (same slot reference returned)', () => {
    const a = reducer(undefined, updateSelectionFocus(ref));
    const b = reducer(
      a,
      updateSelectionFocus({ type: 'galaxyCatalog', source: Source.SDSS, index: 7 }),
    );
    // No-op: the focus slot reference is unchanged (Immer returns the same draft).
    expect(b.focus).toBe(a.focus);
  });

  it('clearSelection clears select + focus but not hover', () => {
    let s: SelectionState = reducer(undefined, updateSelectionHover(ref));
    s = reducer(s, updateSelectionSelect(ref));
    s = reducer(s, updateSelectionFocus(ref));
    const cleared = reducer(s, clearSelection());
    expect(cleared.select).toBeNull();
    expect(cleared.focus).toBeNull();
    expect(cleared.hover).toEqual(ref);
  });
});

describe('selectionSlice pending', () => {
  it('requestFocus records the pending focus id', () => {
    const next = reducer(undefined, requestFocus('NGC 224'));
    expect(next.pending.focus).toBe('NGC 224');
  });

  it('holds the pending focus id across the ref write and retires it on the row', () => {
    const requested = reducer(undefined, requestFocus('NGC 224'));

    // The ref write is NOT the end of the request. `selectPendingFocusId` is the
    // top rung of the URL's precedence ladder and `selectionRows.focus` is the
    // one below it, and the row lands an action later (the reconciler has to be
    // woken by this very write to produce it). Retiring `pending` here leaves a
    // window where the ladder reports the PREVIOUS target — the spurious history
    // entry in tests/state/url/hashHistoryIntegrity.
    const resolved = reducer(requested, updateSelectionFocus(ref));
    expect(resolved.pending.focus).toBe('NGC 224');

    const rowLanded = reducer(resolved, setSelectionRow({ slot: 'focus', row: null }));
    expect(rowLanded.pending.focus).toBeNull();
  });

  it('a newer requestFocus replaces the pending id', () => {
    // What makes takeLatest's cancelled deferral need no unwinding: the newer
    // request has already overwritten the slot the aborted one wrote.
    const first = reducer(undefined, requestFocus('NGC 224'));
    const second = reducer(first, requestFocus('NGC 5128'));
    expect(second.pending.focus).toBe('NGC 5128');
  });

  it('clearSelection nulls both pending slots', () => {
    let state = reducer(undefined, requestFocus('NGC 224'));
    state = reducer(state, requestSelect('NGC 5128'));
    const cleared = reducer(state, clearSelection());
    expect(cleared.pending).toEqual({ select: null, focus: null });
  });

  it('requestSelect and requestFocus track independently', () => {
    const selectOnly = reducer(undefined, requestSelect('NGC 5128'));
    expect(selectOnly.pending).toEqual({ select: 'NGC 5128', focus: null });

    // …and retiring the select request leaves a live focus request alone. The
    // row write carries a slot, so it must retire only that slot's twin — a
    // deep link's `focus` request outlives the `select` half of the same arrival.
    const bothPending = reducer(selectOnly, requestFocus('NGC 224'));
    const selectResolved = reducer(bothPending, setSelectionRow({ slot: 'select', row: null }));
    expect(selectResolved.pending).toEqual({ select: null, focus: 'NGC 224' });
  });
});
