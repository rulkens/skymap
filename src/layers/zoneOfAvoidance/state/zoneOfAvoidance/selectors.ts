import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { ZoneOfAvoidanceSettings } from '../../../../@types/settings/ZoneOfAvoidanceSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): ZoneOfAvoidanceSettings => settings.zoneOfAvoidance,
);

/** The whole cluster, under the slice's own name — mirrors `selectMilkyWay`. */
export const selectZoneOfAvoidance = selectRoute;

export const selectZoneOfAvoidanceEnabled = createSelector(
  [selectRoute],
  (route: ZoneOfAvoidanceSettings): boolean => route.enabled,
);
