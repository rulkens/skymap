import type { GridSlice } from '../../../@types/GridSlice';
import type { SimLaneCounts } from '../../../@types/SimLaneCounts';
import type { UserCatalogLoad } from '../../../@types/UserCatalogLoad';
import { fitBoxToCatalog, gridSlice } from './gridSlice';

// Until the load dialog passes its lanes: a raise then counts the grids alone.
const NO_LANES: SimLaneCounts = { agentCount: 0, pointCount: 0 };

/**
 * fittedGrid — the grid slice Auto fit will leave, through the reducer itself,
 * so the load dialog's preview cannot drift from what Load stores.
 */
export function fittedGrid(
  grid: GridSlice,
  fitBounds: NonNullable<UserCatalogLoad['fitBounds']>,
  lanes: SimLaneCounts = NO_LANES,
): GridSlice {
  return gridSlice.reducer(grid, fitBoxToCatalog({ bounds: fitBounds, lanes }));
}
