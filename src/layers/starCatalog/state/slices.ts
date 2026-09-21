/**
 * The starCatalog Layer's settings tuple, folded into `appSettingsSlices` from here.
 * Settings-only so far — its render and load code still lives in core.
 */

import { starCatalogsSlice } from './starCatalogs/slice';

export const starCatalogLayerSettings = [starCatalogsSlice] as const;
