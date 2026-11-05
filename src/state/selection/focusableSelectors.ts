/**
 * The InfoCard's `FocusableTarget` reads: each slot's row through its kind's `toFocusable`.
 * Apart from `selectors.ts` because `selectionKindOf` imports the app composition: that file
 * is imported by modules the composition itself reaches, so the import there evaluates every
 * Layer mid-way through boot and closes a cycle (`HASH_PARAM_SOURCES` read before it exists).
 * `toFocusable` is pure, so memoizing on the row and the star sidecar is the whole contract.
 */

import { createSelector } from '@reduxjs/toolkit';

import { selectionKindOf } from '../../compositions/selectionKindOf';
import { selectFamousStarsMeta } from '../engine/selectors';
import { selectFocusRow, selectHoverRow, selectSelectRow } from './selectors';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import type { FamousStarMetaEntry } from '../../@types/loading/FamousStarMetaEntry';

function focusableOf(
  row: SelectionRow | null,
  famousStarsMeta: readonly FamousStarMetaEntry[],
): FocusableTarget | null {
  if (row === null) return null;
  return selectionKindOf(row.type).toFocusable(row, famousStarsMeta) as FocusableTarget;
}

/**
 * selectHoveredFocusable — builds a `FocusableTarget` from the hover
 * `SelectionRow`, or null when the hover slot is empty. Memoized on the hover
 * row reference and the famous-star sidecar: `toFocusable` builds a fresh
 * `GalaxyInfo`/`StarInfo` object per call, so this selector gates that work
 * behind a `createSelector` stable-reference check. The sidecar is an input
 * rather than a card read, so a star's curated rows fill in the moment it lands.
 */
export const selectHoveredFocusable = createSelector(
  [selectHoverRow, selectFamousStarsMeta],
  focusableOf,
);

/**
 * selectSelectedFocusable — builds a `FocusableTarget` from the select
 * `SelectionRow`, or null when the select slot is empty. Memoized on the
 * select row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectSelectedFocusable = createSelector(
  [selectSelectRow, selectFamousStarsMeta],
  focusableOf,
);

/**
 * selectFocusedFocusable — builds a `FocusableTarget` from the focus
 * `SelectionRow`, or null when the focus slot is empty. Memoized on the
 * focus row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectFocusedFocusable = createSelector(
  [selectFocusRow, selectFamousStarsMeta],
  focusableOf,
);
