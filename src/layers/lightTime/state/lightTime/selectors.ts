import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { LightTimeSettings } from '../../../../@types/settings/LightTimeSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): LightTimeSettings => settings.lightTime,
);

export const selectLightTimeEnabled = createSelector(
  [selectRoute],
  (route: LightTimeSettings): boolean => route.enabled,
);
