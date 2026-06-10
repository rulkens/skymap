/**
 * buildVolumeFieldsSnapshot — produces the per-field row data the
 * SettingsPanel consumes.
 *
 * Extracted from engine.ts so the load-slots (`cf4DensitySlot`,
 * `mcpmSlot`, `syntheticVolumeSlots`) can build the same snapshot when
 * they fire `cb.volumes?.onFieldsChanged?.(snapshot)` — passing the
 * fresh state through the callback removes the App.tsx ref-dance that
 * previously had to call back into the engine handle via
 * `handle.volumes.getState()` to learn what changed.
 *
 * Both identity and values come from `state.settings.volumes.items`,
 * which is registry-seeded at engine construction.  The panel therefore
 * shows every field's row from boot, before its cube has loaded onto the
 * GPU.  Missing entries fall back to the compile-time defaults from
 * `volumeFieldDefaults` so a newly-added field whose settings row
 * predates a defaults change still produces a complete row.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldRowData } from '../../../@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../../@types/data/VolumeFieldId';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import { DEFAULT_VOLUME_FIELD_INTENSITY, DEFAULT_VOLUME_PALETTE_ID } from '../../../data/defaults';

export function buildVolumeFieldsSnapshot(state: EngineState): ReadonlyArray<VolumeFieldRowData> {
  // Identity comes from the settings keys, which are seeded from the
  // registry at engine construction — the GPU handle list is not consulted.
  const ids = Object.keys(state.settings.volumes.items) as VolumeFieldId[];
  return ids.map((id) => {
    const field = state.settings.volumes.items[id];
    const defaults = getVolumeFieldDefaults(id);
    return {
      handle: id,
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
