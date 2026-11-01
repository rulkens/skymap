import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SStarTrailsSettings } from '../../../../@types/settings/SStarTrailsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SStarTrailsSettings => settings.sStarTrails,
);
