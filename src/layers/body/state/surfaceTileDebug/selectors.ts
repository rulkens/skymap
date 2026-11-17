import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SurfaceTileDebugSettings } from '../../@types/SurfaceTileDebugSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SurfaceTileDebugSettings => settings.surfaceTileDebug,
);

export const selectSurfaceTileOverlays = createSelector([selectRoute], (debug) => debug.overlays);
