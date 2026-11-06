/**
 * The InfoCard's `FocusableTarget` reads: each slot's row through its kind's `toFocusable`.
 * Apart from `selectors.ts` because `selectionKindOf` imports the app composition: that file
 * is imported by modules the composition itself reaches, so the import there evaluates every
 * Layer mid-way through boot and closes a cycle (`HASH_PARAM_SOURCES` read before it exists).
 * `toFocusable` is pure, so memoizing on the row is the whole contract.
 */

import { createSelector } from '@reduxjs/toolkit';

import { selectionKindOf } from '../../compositions/selectionKindOf';
import { selectFocusRow, selectHoverRow, selectSelectRow } from './selectors';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

function focusableOf(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return selectionKindOf(row.type).toFocusable(row) as FocusableTarget;
}

/**
 * selectHoveredFocusable — builds a `FocusableTarget` from the hover
 * `SelectionRow`, or null when the hover slot is empty. Memoized on the hover
 * row reference: `toFocusable` builds a fresh `GalaxyInfo`/`StarInfo` object
 * per call, so this selector gates that work behind a `createSelector`
 * stable-reference check.
 */
export const selectHoveredFocusable = createSelector(
  [selectHoverRow],
  focusableOf,
);

/**
 * selectSelectedFocusable — builds a `FocusableTarget` from the select
 * `SelectionRow`, or null when the select slot is empty. Memoized on the
 * select row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectSelectedFocusable = createSelector(
  [selectSelectRow],
  focusableOf,
);

/**
 * selectFocusedFocusable — builds a `FocusableTarget` from the focus
 * `SelectionRow`, or null when the focus slot is empty. Memoized on the
 * focus row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectFocusedFocusable = createSelector(
  [selectFocusRow],
  focusableOf,
);
