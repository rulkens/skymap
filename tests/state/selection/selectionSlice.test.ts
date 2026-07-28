import { describe, it, expect } from 'vitest';

import reducer, {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { requestSelect } from '../../../src/state/selection/requestSelect';
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

  it('updateSelectionFocus clears the pending focus id', () => {
    const requested = reducer(undefined, requestFocus('NGC 224'));
    const resolved = reducer(requested, updateSelectionFocus(ref));
    expect(resolved.pending.focus).toBeNull();
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

    // …and resolving the select slot leaves a live focus request alone.
    const bothPending = reducer(selectOnly, requestFocus('NGC 224'));
    const selectResolved = reducer(bothPending, updateSelectionSelect(ref));
    expect(selectResolved.pending).toEqual({ select: null, focus: 'NGC 224' });
  });
});
