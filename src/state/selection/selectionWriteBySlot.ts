/**
 * selectionWriteBySlot — the parametric write table for the selection slots.
 *
 * One action creator per slot, keyed by SelectionSlot, so a parametric writer
 * (the re-anchor) dispatches `SELECTION_WRITE_BY_SLOT[slot](ref)` rather than a
 * predicate chain. Its writes re-point a slot at the thing it already held, so
 * the focus entry is a `'cut'`: watchFocusTweenSaga skips cuts, and a reload
 * must never fly the camera.
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
  focus: (ref) => updateSelectionFocus(ref, 'cut'),
};
