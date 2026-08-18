import type { AppState } from '../../@types/AppState';
import { defaultCatalogSlice } from './slices/catalogSlice';
import { defaultGridSlice } from './slices/gridSlice';
import { defaultSimSlice } from './slices/simSlice';
import { defaultViewSlice } from './slices/viewSlice';

/** defaultAppState — the store's seed value, one slice default per field. */
export const defaultAppState: AppState = {
  catalog: defaultCatalogSlice,
  grid: defaultGridSlice,
  sim: defaultSimSlice,
  view: defaultViewSlice,
};
