/**
 * deriveLabelCategoryVisibility — project the per-category label visibility
 * into the flat `Record<LabelCategory, boolean>` the React SettingsPanel
 * consumes for its label checkboxes.
 *
 * Label visibility lives in two authoritative homes, partitioned by category
 * kind: structure categories read `settings.structures.items[cat].labelEnabled`
 * (co-located with their ring axis on one item row), while `famousGalaxy` —
 * which has no structure-item row because it's a curated point-layer concern,
 * not a ring — reads the still-live flat `settings.labelCategoryVisibility`
 * record. This helper merges the two into the single record the panel wants, so
 * the React prop shape is a derived view rather than a third copy that could
 * drift. Routing by `isStructureCategory` keeps it registry-driven (no
 * `famousGalaxy` literal); famous galaxies will fold into the same item-row
 * model in a later slice, at which point this branch collapses.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { LabelCategory } from '../../../@types/engine/data/LabelCategory';
import { LABEL_CATEGORIES } from '../../../data/labelCategories';
import { isStructureCategory } from '../../../data/structureCategories';

export function deriveLabelCategoryVisibility(
  state: Pick<EngineState, 'settings'>,
): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      isStructureCategory(c)
        ? state.settings.structures.items[c].labelEnabled
        : state.settings.labelCategoryVisibility[c],
    ]),
  ) as Record<LabelCategory, boolean>;
}
