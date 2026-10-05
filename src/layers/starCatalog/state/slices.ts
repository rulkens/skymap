/**
 * The starCatalog Layer's settings tuple, folded into `appSettingsSlices` from here.
 */

import { starCatalogsSlice } from './starCatalogs/slice';

export const starCatalogLayerSettings = [starCatalogsSlice] as const;
