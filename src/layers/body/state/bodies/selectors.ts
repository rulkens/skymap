import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { BodySettings } from '../../../../@types/settings/BodySettings';
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../../@types/settings/BodyItemSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): BodySettings => settings.bodies,
);

/** The whole cluster, under the slice's own name. */
export const selectBodies = selectRoute;

/**
 * The per-body item rows — the near-field twin of `selectStarCatalogItems`.
 * `LabelHomes` reads the Immer-stable `items` reference so unrelated writes
 * don't rebuild the label projection.
 */
export const selectBodyItems = createSelector(
  [selectRoute],
  (route: BodySettings): Record<BodyId, BodyItemSettings> => route.items,
);
