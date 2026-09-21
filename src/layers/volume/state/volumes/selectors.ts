import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { VolumeSettings } from '../../../../@types/settings/VolumeSettings';
import type { VolumeFieldId } from '../../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): VolumeSettings => settings.volumes,
);

/** The whole cluster, under the slice's own name. */
export const selectVolumes = selectRoute;

export const selectVolumesEnabled = createSelector(
  [selectRoute],
  (route: VolumeSettings): boolean => route.enabled,
);

export const selectVolumeFieldItems = createSelector(
  [selectRoute],
  (route: VolumeSettings): Partial<Record<VolumeFieldId, VolumeFieldSettings>> => route.items,
);
