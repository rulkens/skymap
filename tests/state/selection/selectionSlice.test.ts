import { describe, it, expect } from 'vitest';

import reducer, {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} from '../../../src/state/selection/selectionSlice';
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
