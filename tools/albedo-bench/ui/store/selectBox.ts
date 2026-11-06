import { createSelector } from '@reduxjs/toolkit';
import type { BenchState } from '../../@types/BenchState';
import { boxFromView } from '../viewPresets';

/** Memoized so the render and field effects, keyed on `box`, only rerun when the view moves. */
export const selectBox = createSelector(
  [(state: BenchState) => state.navigation.view],
  boxFromView,
);
