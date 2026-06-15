/**
 * projectLabelCategoryVisibility — pure projection of the per-category label
 * visibility into the flat `Record<LabelCategory, boolean>` the SettingsPanel
 * reads for its label checkboxes.
 *
 * Label visibility lives in two authoritative homes, partitioned by category
 * kind: structure categories read `structures.items[cat].labelEnabled`
 * (co-located with their ring axis on one item row), while `famousGalaxy` —
 * which has no structure-item row because it's a curated point-layer concern,
 * not a ring — reads its galaxy catalog item row `galaxyCatalogs.items[cat].labelEnabled`.
 * Both homes are uniform item rows; this partitions structure vs galaxy catalog and
 * merges them into the single record the panel wants, so the React prop shape
 * is a derived view rather than a third copy that could drift. Routing by
 * `isStructureCategory` keeps it registry-driven (no `famousGalaxy` literal).
 *
 * ### Why two items Records as arguments (not EngineState)
 *
 * Taking the structure + galaxy catalog items Records directly lets the React side feed
 * them the values of `selectStructureItems(state)` / `selectGalaxyCatalogItems(state)`
 * through a `useMemo`: the record is rebuilt exactly when either stable `items`
 * reference changes, keeping `useSyncExternalStore`'s snapshot stable. The label
 * axis spans both clusters, so the projection takes both.
 */

import type { LabelCategory } from '../../../@types/engine/data/LabelCategory';
import type { GalaxyCatalogId } from '../../../@types/engine/data/GalaxyCatalogId';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import type { StructureItemSettings } from '../../../@types/settings/StructureItemSettings';
import type { GalaxyCatalogItemSettings } from '../../../@types/settings/GalaxyCatalogItemSettings';
import { LABEL_CATEGORIES } from '../../../data/labelCategories';
import { isStructureCategory } from '../../../data/structureCategories';

export function projectLabelCategoryVisibility(
  structureItems: Record<StructureCategory, StructureItemSettings>,
  galaxyCatalogItems: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      isStructureCategory(c)
        ? structureItems[c].labelEnabled
        : galaxyCatalogItems[c as GalaxyCatalogId].labelEnabled,
    ]),
  ) as Record<LabelCategory, boolean>;
}
