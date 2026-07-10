/**
 * SELECTION_WRITE_BY_SLOT — verifies the table maps each SelectionSlot to the
 * action creator that writes that slot. The table is the single parametric
 * write surface for the tier re-anchor; a wrong mapping silently writes to the
 * wrong slot, so an explicit coverage test is worth the two lines.
 */
import { describe, it, expect } from 'vitest';

import { SELECTION_WRITE_BY_SLOT } from '../../../src/state/selection/selectionWriteBySlot';
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from '../../../src/state/selection/selectionSlice';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';

const ref: SelectionRef = { type: 'galaxyCatalog', source: 1, index: 0 };

describe('SELECTION_WRITE_BY_SLOT', () => {
  it('hover slot maps to updateSelectionHover', () => {
    expect(SELECTION_WRITE_BY_SLOT.hover(ref).type).toBe(updateSelectionHover(ref).type);
  });

  it('select slot maps to updateSelectionSelect', () => {
    expect(SELECTION_WRITE_BY_SLOT.select(ref).type).toBe(updateSelectionSelect(ref).type);
  });

  it('focus slot maps to updateSelectionFocus', () => {
    expect(SELECTION_WRITE_BY_SLOT.focus(ref).type).toBe(updateSelectionFocus(ref).type);
  });
});
