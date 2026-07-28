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
 *  - The derived `selectHoveredFocusable`, `selectSelectedFocusable`, and
 *    `selectFocusedFocusable` are the heavy ones: they call `buildFocusable`,
 *    which builds a fresh `GalaxyInfo` from a `GalaxyRow`. These are memoized
 *    via `createSelector` so a write to an unrelated slice doesn't re-run
 *    `buildFocusable` for no reason.
 *  - `selectIsSelectionActive` is a cheap boolean derived from the two ref
 *    slots; memoized so the UI can react to "is anything selected" without
 *    building a full `FocusableTarget`.
 *  - `selectHasSelectionIntent` is the same shape as `selectIsSelectionActive`
 *    but also covers the two `pending` slots, so a deep link still parked in a
 *    deferred resolve counts as intent even though its ref slot reads null.
 *
 * `buildFocusable` is imported from the engine helpers layer, but it is
 * intentionally pure: it touches no engine state, no react-redux, and no
 * mutable resources. The import is allowed here because `src/state/` selectors
 * must NOT import react-redux, and `buildFocusable` satisfies that constraint.
 *
 * Every selector is `RootState`-scoped, so the same function works unchanged on
 * BOTH the React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`).
 */

import { createSelector } from '@reduxjs/toolkit';

import { selectionRoute, selectionRowsRoute } from '../../store/constants';
import { buildFocusable } from '../../services/engine/helpers/buildFocusable';
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

export const selectHoverRef = (state: RootState): SelectionRef | null =>
  selectSelection(state).hover;

export const selectSelectedRef = (state: RootState): SelectionRef | null =>
  selectSelection(state).select;

export const selectFocusRef = (state: RootState): SelectionRef | null =>
  selectSelection(state).focus;

// --- pending request reads (in-flight Intent) ---------------------------------

/**
 * The durable id a `requestSelect` / `requestFocus` is still waiting to resolve,
 * or null when nothing is in flight. Readers that must not lose the target
 * during the resolve window — a request defers until its catalog lands — take
 * the pending id first and fall back to the resolved ref.
 */
export const selectPendingSelectId = (state: RootState): string | null =>
  selectSelection(state).pending.select;

export const selectPendingFocusId = (state: RootState): string | null =>
  selectSelection(state).pending.focus;

// --- selectionRows slot reads (resolved display cache) ------------------------

export const selectHoverRow = (state: RootState): SelectionRow | null =>
  selectSelectionRows(state).hover;

export const selectSelectRow = (state: RootState): SelectionRow | null =>
  selectSelectionRows(state).select;

export const selectFocusRow = (state: RootState): SelectionRow | null =>
  selectSelectionRows(state).focus;

// --- derived FocusableTarget selectors ----------------------------------------

/**
 * selectHoveredFocusable — builds a `FocusableTarget` from the hover
 * `SelectionRow`, or null when the hover slot is empty. Memoized on the hover
 * row reference: `buildFocusable` builds a fresh `GalaxyInfo` object for
 * galaxy rows, so this selector gates that work behind a `createSelector`
 * stable-reference check.
 */
export const selectHoveredFocusable = createSelector(
  selectHoverRow,
  (row): FocusableTarget | null => buildFocusable(row),
);

/**
 * selectSelectedFocusable — builds a `FocusableTarget` from the select
 * `SelectionRow`, or null when the select slot is empty. Memoized on the
 * select row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectSelectedFocusable = createSelector(
  selectSelectRow,
  (row): FocusableTarget | null => buildFocusable(row),
);

/**
 * selectFocusedFocusable — builds a `FocusableTarget` from the focus
 * `SelectionRow`, or null when the focus slot is empty. Memoized on the
 * focus row reference for the same reason as `selectHoveredFocusable`.
 */
export const selectFocusedFocusable = createSelector(
  selectFocusRow,
  (row): FocusableTarget | null => buildFocusable(row),
);

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

/**
 * selectHasSelectionIntent — true when the user has expressed ANY selection
 * intent, resolved OR still in flight: either ref slot holds a SelectionRef,
 * or either pending slot holds a durable id waiting on a deferred resolve
 * (`resolveFocusRefDeferring` parks a galaxy/star id until its catalog pulse
 * lands, which can outlive a boot phase that only checks the resolved refs).
 *
 * This is the guard a "seed only if nothing is going on" check must use
 * instead of `selectSelectedRef`/`selectFocusRef` alone — a deep link that is
 * still resolving is not an empty slot, even though its ref reads null.
 * Memoized over all four inputs so it only recomputes when one of them
 * actually changes.
 */
export const selectHasSelectionIntent = createSelector(
  [selectSelectedRef, selectFocusRef, selectPendingSelectId, selectPendingFocusId],
  (select, focus, pendingSelect, pendingFocus) =>
    select !== null || focus !== null || pendingSelect !== null || pendingFocus !== null,
);
