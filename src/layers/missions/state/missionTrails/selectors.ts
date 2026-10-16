import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { MissionTrailsSettings } from '../../../../@types/settings/MissionTrailsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): MissionTrailsSettings => settings.missionTrails,
);

export const selectMissionTrailsEnabled = createSelector(
  [selectRoute],
  (route: MissionTrailsSettings): boolean => route.enabled,
);
