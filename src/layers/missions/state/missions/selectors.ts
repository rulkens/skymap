import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { MissionsSettings } from '../../../../@types/settings/MissionsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): MissionsSettings => settings.missions,
);

export const selectMissionTrailsEnabled = createSelector(
  [selectRoute],
  (route: MissionsSettings): boolean => route.trails,
);

/** The selected sampled craft's id, or null for none. */
export const selectMissionCraft = createSelector(
  [selectRoute],
  (route: MissionsSettings): string | null => route.craft,
);

export const selectMissionSpeed = createSelector(
  [selectRoute],
  (route: MissionsSettings): number => route.speed,
);
