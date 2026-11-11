import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SatelliteColors } from '../../@types/SatelliteColors';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SatelliteColors => settings.satelliteColors,
);

/** The whole cluster, under the slice's own name. */
export const selectSatelliteColors = selectRoute;
