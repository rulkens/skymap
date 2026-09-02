/**
 * rootReducer — the workbench store's single combine point, mirroring
 * `src/store/rootReducer.ts` at workbench scale (five slices, no route-name
 * indirection needed for a fixed, small set).
 */
import { combineReducers } from '@reduxjs/toolkit';

import { catalogSlice } from '../state/catalog/catalogSlice';
import { gridSlice } from '../state/grid/gridSlice';
import { simSlice } from '../state/sim/simSlice';
import { viewSlice } from '../state/view/viewSlice';
import { histogramSlice } from '../state/histogram/histogramSlice';

export const rootReducer = combineReducers({
  catalog: catalogSlice.reducer,
  grid: gridSlice.reducer,
  sim: simSlice.reducer,
  view: viewSlice.reducer,
  histogram: histogramSlice.reducer,
});
