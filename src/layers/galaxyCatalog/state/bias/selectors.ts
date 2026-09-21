import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { BiasSettings } from '../../../../@types/settings/BiasSettings';
import type { BiasMode } from '../../../../@types/data/galaxyCatalog/BiasMode';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): BiasSettings => settings.bias,
);

/** The whole cluster, under the slice's own name. */
export const selectBias = selectRoute;

export const selectBiasMode = createSelector(
  [selectRoute],
  (route: BiasSettings): BiasMode => route.mode,
);

export const selectAbsMagLimit = createSelector(
  [selectRoute],
  (route: BiasSettings): number => route.absMagLimit,
);
