/**
 * setStructureItemEnabledAction — the thin imperative bridge flipping one
 * structure category's ring/marker-visibility flag. Runs the pure
 * `setStructureItemEnabled` reducer through `store.setState`, the single place
 * `structures.items[cat].enabled` is written, so React's
 * `useSettingsStore(selectStructureItems)` subscriber wakes. The per-category
 * `markerLayer` fade ramp stays in the handle setter — that's a render concern,
 * not a settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { StructureCategory } from '../../../../@types/data/structure/StructureCategory';
import { setStructureItemEnabled } from '../reducers/setStructureItemEnabled';

export function setStructureItemEnabledAction(
  store: SettingsStore,
  category: StructureCategory,
  enabled: boolean,
): void {
  store.setState((s) => setStructureItemEnabled(s, category, enabled));
}
