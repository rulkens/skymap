import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { VoyageSettings } from '../../@types/VoyageSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): VoyageSettings => settings.voyage,
);
