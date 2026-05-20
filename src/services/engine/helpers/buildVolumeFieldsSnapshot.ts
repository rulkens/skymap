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
 * The snapshot merges the renderer's live handle list (the GPU-side
 * registry) with the per-field tunable bag held in
 * `state.settings.volumes.fields`.  Missing entries fall back to the
 * compile-time defaults from `volumeFieldDefaults` so a newly-added
 * field that hasn't been mutated yet still produces a complete row.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { VolumeFieldRowData } from '../../../@types/settings/VolumeFieldRowData';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import {
  DEFAULT_VOLUME_FIELD_INTENSITY,
  DEFAULT_VOLUME_PALETTE_ID,
} from '../../../data/defaults';

export function buildVolumeFieldsSnapshot(
  state: EngineState,
): ReadonlyArray<VolumeFieldRowData> {
  const handles = state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
  return handles.map((h) => {
    const field = state.settings.volumes.fields[h];
    const defaults = getVolumeFieldDefaults(h);
    return {
      handle: h,
      label: defaults.label ?? h,
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
