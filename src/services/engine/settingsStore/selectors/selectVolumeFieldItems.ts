/**
 * selectVolumeFieldItems — pure projection of the per-field volume settings
 * Record.
 *
 * ### Why this returns the RAW items Record, not a projected rows array
 *
 * `useSyncExternalStore`'s `getSnapshot` must return a referentially-STABLE
 * value when nothing changed, or React warns and can loop. The display shape the
 * SettingsPanel wants is a debug-filtered `VolumeFieldRowData[]` — but building
 * that array inside the selector would mint a NEW array on every store read,
 * defeating the stability contract and re-rendering on every unrelated write.
 *
 * So this selector returns the underlying `state.volumes.items` Record verbatim.
 * Under copy-on-write that reference is stable: it only changes when a field
 * actually changes (the per-field reducers spread a new `items`), and it is
 * UNCHANGED when a sibling leaf like `volumes.enabled` toggles (that reducer
 * spreads `volumes` but reuses `items`). The React consumer pairs this stable
 * ref with a `useMemo` over `projectVolumeFieldRows(items)`, so the display
 * array is built exactly when `items` changes — keeping `getSnapshot` stable
 * while the panel still sees the filtered rows.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';

export function selectVolumeFieldItems(
  state: EngineSettingsState,
): Partial<Record<VolumeFieldId, VolumeFieldSettings>> {
  return state.volumes.items;
}
