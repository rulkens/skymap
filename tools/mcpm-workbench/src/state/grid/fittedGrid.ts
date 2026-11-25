import type { GridSlice } from '../../../@types/GridSlice';
import type { SimLaneCounts } from '../../../@types/SimLaneCounts';
import type { UserCatalogLoad } from '../../../@types/UserCatalogLoad';
import { fitBoxToCatalog, gridSlice } from './gridSlice';

/**
 * fittedGrid — the grid slice Auto fit will leave, through the reducer itself,
 * so the load dialog's preview cannot drift from what Load stores. `lanes` must
 * be the ones Load passes: a voxel size raised to fit memory depends on them.
 */
export function fittedGrid(
  grid: GridSlice,
  fitBounds: NonNullable<UserCatalogLoad['fitBounds']>,
  lanes: SimLaneCounts,
): GridSlice {
  return gridSlice.reducer(grid, fitBoxToCatalog({ bounds: fitBounds, lanes }));
}
