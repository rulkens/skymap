/**
 * Typed react-redux hooks for the galaxy-renderer tool's store — same
 * rationale as the main app's `src/store/hooks.ts`: pre-bind `useSelector`'s
 * state and `useDispatch`'s return so components never re-spell a store
 * type at the call site.
 *
 * The selector state is derived from `AppStore['getState']` rather than
 * hand-typed against `AppState` directly, so it always matches whatever
 * `createStore.ts` actually mounts — it widens to the full `AppState` shape
 * automatically once Task 3 adds the `compare`/`extras`/`ui` reducers,
 * without this file changing.
 */

import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, AppStore } from './createStore';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<ReturnType<AppStore['getState']>> = useSelector;
