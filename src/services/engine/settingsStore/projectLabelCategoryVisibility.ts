/**
 * projectLabelCategoryVisibility — pure projection of the per-category label
 * visibility into the flat `Record<LabelCategory, boolean>` the SettingsPanel
 * reads for its label checkboxes.
 *
 * Label visibility lives in two authoritative homes, partitioned by category
 * kind: structure categories read `structures.items[cat].labelEnabled`
 * (co-located with their ring axis on one item row), while `famousGalaxy` —
 * which has no structure-item row because it's a curated point-layer concern,
 * not a ring — reads its survey item row `surveys.items[cat].labelEnabled`.
 * Both homes are uniform item rows; this partitions structure vs survey and
 * merges them into the single record the panel wants, so the React prop shape
 * is a derived view rather than a third copy that could drift. Routing by
 * `isStructureCategory` keeps it registry-driven (no `famousGalaxy` literal).
 *
 * ### Why two items Records as arguments (not EngineState)
 *
 * Taking the structure + survey items Records directly lets the React side feed
 * them the values of `selectStructureItems(state)` / `selectSurveyItems(state)`
 * through a `useMemo`: the record is rebuilt exactly when either stable `items`
 * reference changes, keeping `useSyncExternalStore`'s snapshot stable. The label
 * axis spans both clusters, so the projection takes both.
 */

import type { LabelCategory } from '../../../@types/engine/data/LabelCategory';
import type { SurveyId } from '../../../@types/engine/data/SurveyId';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import type { StructureItemSettings } from '../../../@types/settings/StructureItemSettings';
import type { SurveyItemSettings } from '../../../@types/settings/SurveyItemSettings';
import { LABEL_CATEGORIES } from '../../../data/labelCategories';
import { isStructureCategory } from '../../../data/structureCategories';

export function projectLabelCategoryVisibility(
  structureItems: Record<StructureCategory, StructureItemSettings>,
  surveyItems: Record<SurveyId, SurveyItemSettings>,
): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      isStructureCategory(c)
        ? structureItems[c].labelEnabled
        : surveyItems[c as SurveyId].labelEnabled,
    ]),
  ) as Record<LabelCategory, boolean>;
}
