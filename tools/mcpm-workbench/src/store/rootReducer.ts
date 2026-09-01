/**
 * rootReducer — the workbench store's single combine point, mirroring
 * `src/store/rootReducer.ts` at workbench scale (five slices, no route-name
 * indirection needed for a fixed, small set). Key names — `catalog`, `grid`,
 * `sim`, `view`, `histogram` — are unchanged from the old `AppState` shape,
 * so every selector body (`s.catalog...`, `s.grid...`) survives the migration.
 */
import { combineReducers } from '@reduxjs/toolkit';

import { catalogSlice } from '../state/slices/catalogSlice';
import { gridSlice } from '../state/slices/gridSlice';
import { simSlice } from '../state/slices/simSlice';
import { viewSlice } from '../state/slices/viewSlice';
import { histogramSlice } from '../state/slices/histogramSlice';

export const rootReducer = combineReducers({
  catalog: catalogSlice.reducer,
  grid: gridSlice.reducer,
  sim: simSlice.reducer,
  view: viewSlice.reducer,
  histogram: histogramSlice.reducer,
});
