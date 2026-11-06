/**
 * Selection selectors — the single read seam for the `selection` and
 * `selectionRows` RTK slices, scoped through `RootState`.
 *
 * One module covers both selection-family routes because they form a coherent
 * read surface: `selection` is the raw Intent refs, `selectionRows` is the
 * saga-owned derived display cache. Call sites import from here, not from the
 * individual slice files, so the slice route literals are named exactly once.
 *
 * The shape follows the base + derived `createSelector` split used by
 * `settings/selectors.ts`:
 *
 *  - `selectSelection` and `selectSelectionRows` are the private base selectors
 *    — they lift each slice out of `RootState`. Every derived selector composes
 *    through them.
 *  - The leaf slot selectors (`selectHoverRef`, `selectSelectedRef`,
 *    `selectFocusRef`, `selectHoverRow`, `selectSelectRow`, `selectFocusRow`)
 *    are plain composed arrows. Each returns a stable reference or null;
 *    react-redux's reference-equality `useSelector` already bails out when the
 *    value is unchanged, so no `createSelector` wrapper is needed.
 *  - The derived `selectHoveredFocusable`, `selectSelectedFocusable` and
 *    `selectFocusedFocusable` are the heavy ones: each row's kind builds a fresh
 *    view-model (`toFocusable`), so they are memoized via `createSelector` and a
 *    write to an unrelated slice doesn't rebuild it.
 *  - `selectIsSelectionActive` is a cheap boolean derived from the two ref
 *    slots; memoized so the UI can react to "is anything selected" without
 *    building a full `FocusableTarget`.
 *
 * Every selector is `RootState`-scoped, so the same function works unchanged on
 * BOTH the React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`).
 */

import { createSelector } from '@reduxjs/toolkit';

import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import { selectionKindOf } from '../../services/engine/selection/selectionKindOf';
import type { RootState } from '../../store/types';
import type { SelectionState } from '../../@types/store/SelectionState';
import type { SelectionRowsState } from '../../@types/store/SelectionRowsState';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

// --- base selectors -----------------------------------------------------------

const selectSelection = (state: RootState): SelectionState => state[selectionRoute];

const selectSelectionRows = (state: RootState): SelectionRowsState => state[selectionRowsRoute];

// --- selection ref slot reads (raw Intent) ------------------------------------
export const selectSelectedRef = (state: RootState): SelectionRef | null =>
  selectSelection(state).select;

export const selectFocusRef = (state: RootState): SelectionRef | null =>
  selectSelection(state).focus;

// --- pending request reads (in-flight Intent) ---------------------------------

/**
 * The durable id a `requestFocus` is still waiting to resolve, or null when
 * nothing is in flight. Readers that must not lose the target during the
 * resolve window — a request defers until its catalog lands — take the pending
 * id first and fall back to the resolved ref.
 */
export const selectPendingFocusId = (state: RootState): string | null =>
  selectSelection(state).pending.focus;

export const selectPendingSelectId = (state: RootState): string | null =>
  selectSelection(state).pending.select;

// --- selectionRows slot reads (resolved display cache) ------------------------

const selectHoverRow = (state: RootState): SelectionRow | null => selectSelectionRows(state).hover;

const selectSelectRow = (state: RootState): SelectionRow | null =>
  selectSelectionRows(state).select;

export const selectFocusRow = (state: RootState): SelectionRow | null =>
  selectSelectionRows(state).focus;

/**
 * The focus row's `#focus=` id, stored beside the row by the reconciler; null
 * when nothing is focused or the kind has no link form (the dust band).
 */
export const selectFocusId = (state: RootState): string | null =>
  selectSelectionRows(state).focusId;

// --- derived FocusableTarget selectors ----------------------------------------

const focusableOf = (row: SelectionRow | null): FocusableTarget | null =>
  row === null ? null : (selectionKindOf(row.type).toFocusable(row) as FocusableTarget);

/** The hover row's card view-model, or null; memoized on the row reference. */
export const selectHoveredFocusable = createSelector([selectHoverRow], focusableOf);

/** The select row's card view-model, or null; memoized on the row reference. */
export const selectSelectedFocusable = createSelector([selectSelectRow], focusableOf);

/** The focus row's card view-model, or null; memoized on the row reference. */
export const selectFocusedFocusable = createSelector([selectFocusRow], focusableOf);

/**
 * selectIsSelectionActive — true when either the select or the focus ref slot
 * holds a SelectionRef. The cheap boolean the UI uses to know "is something
 * selected" without building a FocusableTarget. Memoized over the two ref
 * inputs so it only recomputes when a ref slot actually changes.
 */
export const selectIsSelectionActive = createSelector(
  [selectSelectedRef, selectFocusRef],
  (select, focus) => select !== null || focus !== null,
);
