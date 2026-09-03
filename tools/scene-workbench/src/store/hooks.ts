/**
 * Typed react-redux hooks. Importing `react-redux` is allowed HERE and
 * nowhere else under `tools/scene-workbench/` except `App.tsx` (the
 * `<Provider>`'s construction site) — every component reaches the store
 * through these wrappers.
 */
import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, RootState, SceneStore } from './types';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

/** Typed `useStore` — returns the scene workbench's concrete store (dispatch + getState typed). */
export const useAppStore: () => SceneStore = useStore;
