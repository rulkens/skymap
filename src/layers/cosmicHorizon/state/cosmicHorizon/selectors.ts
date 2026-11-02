import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { CosmicHorizonSettings } from '../../../../@types/settings/CosmicHorizonSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): CosmicHorizonSettings => settings.cosmicHorizon,
);
