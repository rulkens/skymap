/**
 * projectMarkerCategoryVisibility — pure projection from the per-category
 * structure settings Record to the flat `Record<StructureId, boolean>`
 * the SettingsPanel reads for its marker (ring) checkboxes.
 *
 * The structure items ARE the truth: each `items[cat].enabled` is the marker
 * axis. The panel still wants a record keyed by category (least churn — the
 * prop shape doesn't change), so this derives that view rather than storing the
 * same fact in a second home. Keeping the items as the single source un-braids
 * "same boolean in two places" — the record is a pure projection rebuilt when
 * the items reference changes, never an independent leaf that could drift.
 *
 * ### Why a free function over the items Record (not over EngineState)
 *
 * Taking the items Record directly lets the React side feed it the value of
 * `selectStructureItems(state)` through a `useMemo`: the record is rebuilt
 * exactly when the stable `items` reference changes, keeping
 * `useSyncExternalStore`'s snapshot stable.
 */

import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';

export function projectMarkerCategoryVisibility(
  items: Record<StructureId, StructureItemSettings>,
): Record<StructureId, boolean> {
  return Object.fromEntries(STRUCTURE_IDS.map((c) => [c, items[c].enabled])) as Record<
    StructureId,
    boolean
  >;
}
