/**
 * projectLabelCategoryVisibility — pure projection of the per-category label
 * visibility into the flat `Record<LabelCategory, boolean>` the SettingsPanel
 * reads for its label checkboxes.
 *
 * Label visibility lives in three authoritative homes:
 *   - structure categories read `structures.items[cat].labelEnabled` (co-located
 *     with their ring axis on one item row);
 *   - `famousGalaxy` — which has no structure-item row because it's a curated
 *     point-layer concern, not a ring — reads its galaxy catalog item row
 *     `galaxyCatalogs.items[cat].labelEnabled`;
 *   - `milkyWay` reads the scalar `settings.milkyWay.labelEnabled`.
 * This projection partitions structure vs galaxy catalog (routing by
 * `isStructureId`, which keeps it registry-driven — no `famousGalaxy`
 * literal) and overlays the milkyWay scalar, merging all three into the single
 * record the panel wants. The React prop shape is therefore a derived view, not
 * a fourth stored copy that could drift.
 *
 * ### Why milkyWay is a scalar argument, not an items row
 *
 * The structure + galaxy-catalog homes are uniform per-record item Records.
 * `milkyWay` is a singleton-overlay axis with no per-record catalog (one disk,
 * one "You are here" label), so it has no item row to read — it carries a single
 * `labelEnabled` boolean in `settings.milkyWay`. Passing that boolean directly
 * (rather than synthesising a one-entry `items` record to force uniformity)
 * keeps the singleton-vs-per-record asymmetry honest instead of pretending the
 * overlay is a catalog.
 *
 * ### Why these arguments (not EngineState)
 *
 * Taking the structure + galaxy catalog items Records (plus the milkyWay scalar)
 * directly lets the React side feed them the values of
 * `selectStructureItems(state)` / `selectGalaxyCatalogItems(state)` /
 * `selectMilkyWayLabelEnabled(state)` through a `useMemo`: the record is rebuilt
 * exactly when any of those stable references/values changes, keeping
 * `useSyncExternalStore`'s snapshot stable.
 */

import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { isStructureId } from '../../data/structure/structureIds';

export function projectLabelCategoryVisibility(
  structureItems: Record<StructureId, StructureItemSettings>,
  galaxyCatalogItems: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
  milkyWayLabelEnabled: boolean,
): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      c === 'milkyWay'
        ? milkyWayLabelEnabled
        : isStructureId(c)
          ? structureItems[c].labelEnabled
          : galaxyCatalogItems[c as GalaxyCatalogId].labelEnabled,
    ]),
  ) as Record<LabelCategory, boolean>;
}
