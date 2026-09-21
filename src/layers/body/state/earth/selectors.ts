import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { EarthSettings } from '../../../../@types/settings/EarthSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): EarthSettings => settings.earth,
);

/** The whole cluster, under the slice's own name. */
export const selectEarth = selectRoute;

export const selectAtmosphereExposure = createSelector(
  [selectRoute],
  (route: EarthSettings): number => route.atmosphereExposure,
);

export const selectAmbientLight = createSelector(
  [selectRoute],
  (route: EarthSettings): number => route.ambientLight,
);

export const selectOceanRoughness = createSelector(
  [selectRoute],
  (route: EarthSettings): number => route.oceanRoughness,
);
