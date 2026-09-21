import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { StructureSettings } from '../../../../@types/settings/StructureSettings';
import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): StructureSettings => settings.structures,
);

/** The whole cluster, under the slice's own name. */
export const selectStructures = selectRoute;

export const selectStructureItems = createSelector(
  [selectRoute],
  (route: StructureSettings): Record<StructureId, StructureItemSettings> => route.items,
);
