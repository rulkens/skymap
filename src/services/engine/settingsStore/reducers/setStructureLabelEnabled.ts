/**
 * setStructureLabelEnabled — pure reducer flipping one structure category's
 * text-label visibility (`structures.items[cat].labelEnabled`).
 *
 * The label axis is INDEPENDENT of the ring axis (`enabled`): a category's ring
 * can be hidden while its label still renders, and vice versa, so they live as
 * two flags on one row and this reducer touches only `labelEnabled`. The flag is
 * authoritative — the structure-label producer draws while it's true (or still
 * fading out), and `projectLabelCategoryVisibility` packs the panel's checkbox
 * view FROM it.
 *
 * Three nested copies, no deeper: a new top-level state, a new `structures`
 * cluster, a new `items` record, and a new row for the touched category. Sibling
 * categories, the `structures.enabled` master gate, and the category's own
 * `enabled` ring flag keep their existing references.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { StructureCategory } from '../../../../@types/engine/data/StructureCategory';

export function setStructureLabelEnabled(
  state: EngineSettingsState,
  category: StructureCategory,
  labelEnabled: boolean,
): EngineSettingsState {
  return {
    ...state,
    structures: {
      ...state.structures,
      items: {
        ...state.structures.items,
        [category]: { ...state.structures.items[category], labelEnabled },
      },
    },
  };
}
