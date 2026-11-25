import type { GridSlice } from '../../../@types/GridSlice';
import type { UserCatalogLoad } from '../../../@types/UserCatalogLoad';
import { fitBoxToCatalog, gridSlice } from './gridSlice';

/**
 * fittedGrid — the grid slice Auto fit will leave, through the reducer itself,
 * so the load dialog's preview cannot drift from what Load stores.
 */
export function fittedGrid(
  grid: GridSlice,
  fitBounds: NonNullable<UserCatalogLoad['fitBounds']>,
): GridSlice {
  return gridSlice.reducer(grid, fitBoxToCatalog(fitBounds));
}
