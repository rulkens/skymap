import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SatellitesSettings } from '../../../../@types/settings/SatellitesSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SatellitesSettings => settings.satellites,
);

/** The whole cluster, under the slice's own name. */
export const selectSatellites = selectRoute;
