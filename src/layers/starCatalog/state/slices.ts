/**
 * The starCatalog Layer's settings tuple, folded into `appSettingsSlices` from here.
 */

import { starCatalogsSlice } from './starCatalogs/slice';
import { sStarTrailsSlice } from './sStarTrails/slice';

export const starCatalogLayerSettings = [starCatalogsSlice, sStarTrailsSlice] as const;
