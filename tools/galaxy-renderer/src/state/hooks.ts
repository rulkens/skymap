/**
 * Typed react-redux hooks for the galaxy-renderer tool's store — same
 * rationale as the main app's `src/store/hooks.ts`: pre-bind `useSelector`'s
 * state and `useDispatch`'s return so components never re-spell a store
 * type at the call site.
 *
 * The selector state is derived from `AppStore['getState']` rather than
 * hand-typed against `AppState` directly, so it always matches whatever
 * `createStore.ts` actually mounts — the two only stay equal because
 * `createStore.ts` carries its own trip-wire checking that.
 */

import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, AppStore } from './createStore';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<ReturnType<AppStore['getState']>> = useSelector;

/** Typed `useStore` — returns the tool's concrete `AppStore` (dispatch + getState typed). */
export const useAppStore: () => AppStore = useStore;
