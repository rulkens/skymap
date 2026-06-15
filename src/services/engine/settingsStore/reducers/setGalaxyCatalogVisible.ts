/**
 * setGalaxyCatalogVisible — pure reducer flipping one galaxy catalog's layer-visibility bit.
 *
 * Per-galaxy catalog visibility is the AUTHORITATIVE on/off intent for a galaxy catalog layer
 * (`deriveSourceMasks` packs the draw/pick bitmasks FROM this flag, never the
 * other way round). This reducer is the copy-on-write write of that single
 * source of truth.
 *
 * Three nested copies, no deeper: a new top-level state, a new `galaxyCatalogs`
 * cluster, a new `items` record, and a new row for the touched galaxy catalog id.
 * Sibling clusters, sibling galaxy catalog rows, and the galaxy catalog's own `labelEnabled`
 * all keep their existing references — structural sharing so selectors over
 * untouched rows skip re-rendering. Mutating `items[id].enabled` in place would
 * defeat that and risk a stale snapshot the per-frame derive reads from.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../@types/engine/data/GalaxyCatalogId';

export function setGalaxyCatalogVisible(
  state: EngineSettingsState,
  id: GalaxyCatalogId,
  enabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    galaxyCatalogs: {
      ...state.galaxyCatalogs,
      items: {
        ...state.galaxyCatalogs.items,
        [id]: { ...state.galaxyCatalogs.items[id], enabled },
      },
    },
  };
}
