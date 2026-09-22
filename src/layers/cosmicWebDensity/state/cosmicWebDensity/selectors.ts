import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { CosmicWebDensitySettings } from '../../../../@types/settings/CosmicWebDensitySettings';
import type { CosmicWebDensityFieldId } from '../../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): CosmicWebDensitySettings => settings.cosmicWebDensity,
);

/** The whole cluster, under the slice's own name. */
export const selectCosmicWebDensity = selectRoute;

export const selectCosmicWebDensityEnabled = createSelector(
  [selectRoute],
  (route: CosmicWebDensitySettings): boolean => route.enabled,
);

export const selectCosmicWebDensityFieldItems = createSelector(
  [selectRoute],
  (route: CosmicWebDensitySettings): Partial<Record<CosmicWebDensityFieldId, VolumeFieldSettings>> => route.items,
);
