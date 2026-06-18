/**
 * projectVolumeFieldRows — pure projection from the per-field volume settings
 * Record to the `VolumeFieldRowData[]` the SettingsPanel renders.
 *
 * Identity AND values come from the items Record (registry-seeded at engine
 * construction), so the panel shows every field's row from boot, before its cube
 * has loaded onto the GPU. The GPU handle list is not consulted. Missing leaves
 * fall back to the compile-time defaults from `volumeFieldDefaults` so a
 * newly-added field whose settings row predates a defaults change still produces
 * a complete row.
 *
 * ### Why a free function over the items Record (not over EngineState)
 *
 * Taking the items Record directly (rather than the whole `EngineState`) lets
 * the React side feed it the value of `selectVolumeFieldItems(state)` through a
 * `useMemo`: the array is rebuilt exactly when the stable `items` reference
 * changes, keeping `useSyncExternalStore`'s snapshot stable. The engine-side
 * `buildVolumeFieldsSnapshot` delegates here too, so both views of the rows stay
 * one implementation.
 *
 * The `debug-*` fixture filter is NOT applied here — it's the React consumer's
 * concern (the panel only shows real science volumes; the dev console still
 * wants the fixtures). Callers that want the filtered view apply it on the way
 * out, exactly as the old `onFieldsChanged` subscription did.
 */

import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import { getVolumeFieldDefaults } from '../../data/volume/volumeFieldDefaults';
import { DEFAULT_VOLUME_FIELD_INTENSITY, DEFAULT_VOLUME_PALETTE_ID } from '../../data/defaults';

export function projectVolumeFieldRows(
  items: Partial<Record<VolumeFieldId, VolumeFieldSettings>>,
): ReadonlyArray<VolumeFieldRowData> {
  const ids = Object.keys(items) as VolumeFieldId[];
  return ids.map((id) => {
    const field = items[id];
    const defaults = getVolumeFieldDefaults(id);
    return {
      id,
      label: defaults.label ?? id,
      enabled: field?.enabled ?? true,
      intensity: field?.intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY,
      contrast: field?.contrast ?? defaults.contrast,
      densityScale: field?.densityScale ?? defaults.densityScale,
      paletteId: field?.paletteId ?? DEFAULT_VOLUME_PALETTE_ID,
      trim: field?.trim ?? defaults.trim,
      exposure: field?.exposure ?? defaults.exposure,
    };
  });
}
