/**
 * Typed react-redux hooks — the wrappers every component reads the store
 * through.
 *
 * Plain `useSelector` infers its `state` argument as `unknown` and `useDispatch`
 * returns the un-narrowed `Dispatch` (no knowledge of the saga/thunk middleware).
 * Re-annotating `RootState` / `AppDispatch` at every call site is the failure mode
 * these wrappers exist to prevent: `useAppSelector` pre-binds the selector's input
 * to `RootState`, and `useAppDispatch` pre-binds the return to `AppDispatch`, so a
 * component writes `useAppSelector((state) => state.settings.tier)` with full
 * inference and never re-spells a store type.
 *
 * Importing `react-redux` is allowed HERE because this file IS the store seam.
 * It is NOT allowed in `src/state/` (pure slices/selectors, framework-agnostic)
 * or `src/services/` (the engine, which must not depend on React) — those reach
 * the store through these wrappers, never through `react-redux` directly.
 */

import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, RootState } from './types';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
