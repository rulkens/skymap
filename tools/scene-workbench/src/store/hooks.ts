/**
 * Typed react-redux hooks. Importing `react-redux` is allowed HERE and
 * nowhere else under `tools/scene-workbench/` except `App.tsx` (the
 * `<Provider>`'s construction site) — every component reaches the store
 * through these wrappers.
 */
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';

import type { AppDispatch, RootState } from './types';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
