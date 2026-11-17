/** Typed react-redux hooks: the one place under `tools/albedo-bench/` that
 *  imports `react-redux`, besides `main.tsx`'s `<Provider>`. */
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { BenchDispatch } from '../../@types/BenchDispatch';
import type { BenchState } from '../../@types/BenchState';

export const useAppDispatch: () => BenchDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<BenchState> = useSelector;
