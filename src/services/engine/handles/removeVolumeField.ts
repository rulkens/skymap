// ── Volume field removal ────────────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so it's testable without a full GPU engine.
//
// Drop the GPU upload first, then remove the settings row. No fade: removal
// fires no ramp — the field vanishes outright.

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { removeVolumeFieldAction } from '../settingsStore/actions/removeVolumeFieldAction';
import type { ApplyIntentState } from '../wiring/syncVisibilityFades';

export function removeVolumeField(
  state: ApplyIntentState,
  store: SettingsStore,
  fieldId: VolumeFieldId,
): void {
  state.gpu.volumeFieldRenderer?.unload(fieldId);
  removeVolumeFieldAction(store, fieldId);
  // Essential wake: removal fires no fade — the field vanishes outright.
  state.subsystems.scheduler.requestRender();
}
