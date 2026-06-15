/**
 * setGalaxyCatalogLabelEnabled — pure reducer flipping one galaxy catalog's text-label
 * visibility (`galaxyCatalogs.items[id].labelEnabled`).
 *
 * Galaxy catalog label visibility co-locates with the galaxy catalog's `enabled` row rather
 * than sitting in a parallel record: one place reads both points-on/off and
 * labels-on/off for a galaxy catalog. Only the famous-galaxy catalog actually renders a
 * label today; the others carry the flag inertly. The flag is authoritative —
 * `projectLabelCategoryVisibility` packs the panel's checkbox view FROM it for
 * the `famousGalaxy` slot.
 *
 * Three nested copies, no deeper: a new top-level state, a new `galaxyCatalogs`
 * cluster, a new `items` record, and a new row for the touched galaxy catalog. Sibling
 * galaxy catalogs and the galaxy catalog's own `enabled` layer-visibility flag keep their
 * existing references.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../@types/engine/data/GalaxyCatalogId';

export function setGalaxyCatalogLabelEnabled(
  state: EngineSettingsState,
  id: GalaxyCatalogId,
  labelEnabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    galaxyCatalogs: {
      ...state.galaxyCatalogs,
      items: {
        ...state.galaxyCatalogs.items,
        [id]: { ...state.galaxyCatalogs.items[id], labelEnabled },
      },
    },
  };
}
