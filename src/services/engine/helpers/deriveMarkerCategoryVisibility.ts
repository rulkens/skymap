/**
 * deriveMarkerCategoryVisibility — project the authoritative
 * `settings.structures.items` into the flat `Record<StructureCategory, boolean>`
 * the React SettingsPanel consumes for its marker (ring) checkboxes.
 *
 * The structure items ARE the truth: each `items[cat].enabled` is the marker
 * axis. The React shell still wants a record keyed by category (least churn —
 * the panel's prop shape doesn't change), so this helper derives that view
 * rather than storing the same fact in a second home. Keeping the items as the
 * single source un-braids "same boolean in two places" — the record is a pure
 * projection rebuilt on every echo, never an independent leaf that could drift.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import { STRUCTURE_CATEGORIES } from '../../../data/structureCategories';

export function deriveMarkerCategoryVisibility(
  state: Pick<EngineState, 'settings'>,
): Record<StructureCategory, boolean> {
  return Object.fromEntries(
    STRUCTURE_CATEGORIES.map((c) => [c, state.settings.structures.items[c].enabled]),
  ) as Record<StructureCategory, boolean>;
}
