/**
 * setStructureItemEnabled — pure reducer flipping one structure category's
 * ring/marker visibility (`structures.items[cat].enabled`).
 *
 * The `enabled` flag is the AUTHORITATIVE gate for a category's ring: the marker
 * producer draws while it's true (or still fading out), and
 * `projectMarkerCategoryVisibility` packs the panel's checkbox view FROM this
 * flag, never the other way round. This reducer is the copy-on-write write of
 * that single source of truth.
 *
 * Three nested copies, no deeper: a new top-level state, a new `structures`
 * cluster, a new `items` record, and a new row for the touched category.
 * Sibling categories, the sibling `structures.enabled` master gate, and the
 * category's own `labelEnabled` (the independent text axis) all keep their
 * existing references — structural sharing so selectors over untouched rows
 * skip re-rendering.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { StructureCategory } from '../../../../@types/data/structure/StructureCategory';

export function setStructureItemEnabled(
  state: EngineSettingsState,
  category: StructureCategory,
  enabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    structures: {
      ...state.structures,
      items: {
        ...state.structures.items,
        [category]: { ...state.structures.items[category], enabled },
      },
    },
  };
}
