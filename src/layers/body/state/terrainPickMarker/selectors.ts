import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { TerrainPickMarkerSettings } from '../../@types/TerrainPickMarkerSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): TerrainPickMarkerSettings => settings.terrainPickMarker,
);

export const selectTerrainPickMarkerEnabled = createSelector(
  [selectRoute],
  (marker) => marker.enabled,
);

export const selectTerrainPickMarkerRadiusM = createSelector(
  [selectRoute],
  (marker) => marker.radiusM,
);
