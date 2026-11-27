/**
 * Typed react-redux hooks — mirrors `src/store/hooks.ts`. Importing
 * `react-redux` is allowed HERE and nowhere else under `tools/mcpm-workbench/`
 * — every component reaches the store through these wrappers.
 */
import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, RootState, WorkbenchStore } from './types';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/** Typed `useStore` — returns the workbench's concrete store (dispatch + getState typed). */
export const useAppStore: () => WorkbenchStore = useStore;
