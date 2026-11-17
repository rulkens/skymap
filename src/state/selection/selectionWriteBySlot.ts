/**
 * selectionWriteBySlot — the parametric write table for the selection slots.
 *
 * One action creator per slot, keyed by SelectionSlot. The tier re-anchor (and
 * any other parametric writer) dispatches `SELECTION_WRITE_BY_SLOT[slot](ref)`
 * rather than a predicate chain, so adding a slot is a one-line widening of
 * SelectionState that flows here automatically via the `keyof SelectionState`
 * constraint on SelectionSlot.
 */
import {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
} from './selectionSlice';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

export const SELECTION_WRITE_BY_SLOT: Record<
  SelectionSlot,
  (ref: SelectionRefBase | null) => PayloadAction<SelectionRefBase | null>
> = {
  hover: updateSelectionHover,
  select: updateSelectionSelect,
  focus: updateSelectionFocus,
};
