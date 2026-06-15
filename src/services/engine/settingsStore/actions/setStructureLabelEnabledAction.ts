/**
 * setStructureLabelEnabledAction — the thin imperative bridge flipping one
 * structure category's text-label-visibility flag. Runs the pure
 * `setStructureLabelEnabled` reducer through `store.setState`, the single place
 * `structures.items[cat].labelEnabled` is written, so React's
 * `useSettingsStore(selectStructureItems)` subscriber wakes. The per-category
 * `labelLayer` fade ramp stays in the handle setter — a render concern, not a
 * settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { StructureCategory } from '../../../../@types/data/structure/StructureCategory';
import { setStructureLabelEnabled } from '../reducers/setStructureLabelEnabled';

export function setStructureLabelEnabledAction(
  store: SettingsStore,
  category: StructureCategory,
  labelEnabled: boolean,
): void {
  store.setState((s) => setStructureLabelEnabled(s, category, labelEnabled));
}
