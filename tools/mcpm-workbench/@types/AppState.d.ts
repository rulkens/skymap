import type { CatalogSlice } from './CatalogSlice';
import type { GridSlice } from './GridSlice';
import type { SimSlice } from './SimSlice';
import type { ViewSlice } from './ViewSlice';

/** AppState — the workbench's whole store snapshot, one field per slice. */
export type AppState = {
  readonly catalog: CatalogSlice;
  readonly grid: GridSlice;
  readonly sim: SimSlice;
  readonly view: ViewSlice;
};
