/**
 * selectStructureItems — returns the RAW per-category structure settings
 * Record, by reference.
 *
 * ### Why this returns the items Record, not a derived visibility map
 *
 * The SettingsPanel wants two flat `Record<Category, boolean>` views — one for
 * the ring/marker axis (`items[cat].enabled`) and one for the text-label axis
 * (`items[cat].labelEnabled`). Building either inside this selector would mint a
 * NEW object on every store read, breaking `useSyncExternalStore`'s stability
 * contract (a fresh `getSnapshot` value re-fires the subscription every render,
 * even on an unrelated write).
 *
 * So this selector hands back `state.structures.items` verbatim. Under
 * copy-on-write that reference is stable: it changes only when a category row
 * actually changes (the per-axis reducers spread a new `items`), and is
 * UNCHANGED when a sibling leaf like `structures.enabled` toggles (that reducer
 * spreads `structures` but reuses `items`). The React consumer pairs this stable
 * ref with `useMemo` projections (`projectMarkerCategoryVisibility` /
 * `projectLabelCategoryVisibility`), so each derived record is rebuilt exactly
 * when `items` changes — keeping the snapshot stable while the panel still sees
 * the flat per-category maps.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { StructureCategory } from '../../../../@types/data/structure/StructureCategory';
import type { StructureItemSettings } from '../../../../@types/settings/StructureItemSettings';

export function selectStructureItems(
  state: EngineSettingsState,
): Record<StructureCategory, StructureItemSettings> {
  return state.structures.items;
}
