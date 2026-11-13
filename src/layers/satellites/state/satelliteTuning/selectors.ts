import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SatelliteTuning } from '../../@types/SatelliteTuning';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SatelliteTuning => settings.satelliteTuning,
);

/** The whole cluster, under the slice's own name. */
export const selectSatelliteTuning = selectRoute;
