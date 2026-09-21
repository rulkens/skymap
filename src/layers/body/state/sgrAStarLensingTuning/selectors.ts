import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { SgrAStarLensingTuning } from '../../../../@types/settings/SgrAStarLensingTuning';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): SgrAStarLensingTuning => settings.sgrAStarLensingTuning,
);

/** The whole tuning cluster — the slider board needs every knob at once. */
export const selectSgrAStarLensingTuning = selectRoute;
